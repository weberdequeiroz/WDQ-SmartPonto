<?php
// API usada pelo app: info, sync (envia a lista de avisos), pending (o aparelho busca o texto), test, unsubscribe.
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') exit;

$c = config();
if (!$c) json_out(['error' => 'Servidor ainda não configurado: abra setup.php no navegador.'], 503);
if (!hash_equals((string) $c['app_key'], (string) ($_GET['k'] ?? ''))) json_out(['error' => 'Link do servidor inválido.'], 403);

$action = $_GET['action'] ?? 'info';
$in = json_decode((string) file_get_contents('php://input'), true) ?: [];
$endpoint = (string) ($in['endpoint'] ?? $_GET['e'] ?? '');
$pdo = db();
$now = now_ms();

if ($action === 'info') json_out(['ok' => true, 'vapid' => $c['vapid_public'], 'accounts' => true]);

// ---------- Conta: login por código enviado ao e-mail ----------
if ($action === 'auth_request') {
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(['error' => 'Digite um e-mail válido.'], 400);
    $q = $pdo->prepare('SELECT sent FROM codes WHERE email = ?');
    $q->execute([$email]);
    $sent = (int) $q->fetchColumn();
    if ($sent && $now - $sent < 60000) json_out(['error' => 'Aguarde um minuto para pedir outro código.'], 429);
    $code = (string) random_int(100000, 999999);
    $hash = hash_hmac('sha256', $email . '|' . $code, server_secret($c));
    $pdo->prepare('INSERT OR REPLACE INTO codes (email, hash, expires, attempts, sent) VALUES (?, ?, ?, 0, ?)')
        ->execute([$email, $hash, $now + 10 * 60000, $now]);
    if (!send_code_mail($c, $email, $code)) json_out(['error' => 'Não foi possível enviar o e-mail. Avise o responsável pelo servidor.'], 500);
    json_out(['ok' => true]);
}

if ($action === 'auth_verify') {
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    $code = preg_replace('/\D/', '', (string) ($in['code'] ?? ''));
    $q = $pdo->prepare('SELECT hash, expires, attempts FROM codes WHERE email = ?');
    $q->execute([$email]);
    $row = $q->fetch(PDO::FETCH_ASSOC);
    if (!$row || $row['expires'] < $now) json_out(['error' => 'Código expirado. Peça um novo.'], 400);
    if ($row['attempts'] >= 5) json_out(['error' => 'Muitas tentativas. Peça um novo código.'], 429);
    if (!hash_equals($row['hash'], hash_hmac('sha256', $email . '|' . $code, server_secret($c)))) {
        $pdo->prepare('UPDATE codes SET attempts = attempts + 1 WHERE email = ?')->execute([$email]);
        json_out(['error' => 'Código incorreto.'], 400);
    }
    $pdo->prepare('DELETE FROM codes WHERE email = ?')->execute([$email]);
    $pdo->prepare('INSERT OR IGNORE INTO users (email, created) VALUES (?, ?)')->execute([$email, $now]);
    $q = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $q->execute([$email]);
    $uid = (int) $q->fetchColumn();
    $token = b64u(random_bytes(32));
    $pdo->prepare('INSERT INTO sessions (hash, user_id, created, used, device) VALUES (?, ?, ?, ?, ?)')
        ->execute([hash('sha256', $token), $uid, $now, $now, mb_substr((string) ($in['device'] ?? ''), 0, 120)]);
    $q = $pdo->prepare('SELECT COUNT(*) FROM data WHERE user_id = ? AND deleted = 0');
    $q->execute([$uid]);
    json_out(['ok' => true, 'token' => $token, 'email' => $email, 'records' => (int) $q->fetchColumn()]);
}

if (in_array($action, ['data_sync', 'logout', 'delete_account'], true)) {
    $uid = session_user($pdo, (string) ($in['token'] ?? ''));
    if ($uid === null) json_out(['error' => 'Sessão expirada. Entre de novo com seu e-mail.', 'auth' => false], 401);

    if ($action === 'logout') {
        $pdo->prepare('DELETE FROM sessions WHERE hash = ?')->execute([hash('sha256', (string) $in['token'])]);
        json_out(['ok' => true]);
    }
    if ($action === 'delete_account') {
        foreach (['data', 'sessions'] as $t) $pdo->prepare("DELETE FROM $t WHERE user_id = ?")->execute([$uid]);
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$uid]);
        json_out(['ok' => true]);
    }

    // Sincronização: recebe alterações (vale a mais recente de cada registro) e devolve o que mudou desde "rev".
    $changes = is_array($in['changes'] ?? null) ? array_slice($in['changes'], 0, 1000) : [];
    $pdo->exec('BEGIN IMMEDIATE');
    $q = $pdo->prepare('SELECT IFNULL(MAX(rev), 0) FROM data WHERE user_id = ?');
    $q->execute([$uid]);
    $rev = (int) $q->fetchColumn();
    $get = $pdo->prepare('SELECT updated FROM data WHERE user_id = ? AND kind = ? AND id = ?');
    $put = $pdo->prepare('INSERT OR REPLACE INTO data (user_id, kind, id, json, updated, deleted, rev) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $accepted = 0;
    foreach ($changes as $ch) {
        $kind = (string) ($ch['kind'] ?? '');
        $id = mb_substr((string) ($ch['id'] ?? ''), 0, 120);
        $upd = (int) ($ch['updated'] ?? 0);
        if (!in_array($kind, ['punch', 'reminder', 'dayinfo', 'settings'], true) || $id === '' || $upd <= 0) continue;
        $get->execute([$uid, $kind, $id]);
        $cur = $get->fetchColumn();
        if ($cur !== false && (int) $cur >= $upd) continue;
        $json = empty($ch['deleted']) ? json_encode($ch['data'] ?? null, JSON_UNESCAPED_UNICODE) : null;
        if ($json !== null && strlen($json) > 20000) continue;
        $put->execute([$uid, $kind, $id, $json, $upd, empty($ch['deleted']) ? 0 : 1, ++$rev]);
        $accepted++;
    }
    $pdo->exec('COMMIT');
    $since = max(0, (int) ($in['rev'] ?? 0));
    $q = $pdo->prepare('SELECT kind, id, json, updated, deleted, rev FROM data WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT 2000');
    $q->execute([$uid, $since]);
    $rows = [];
    $last = $since;
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $rows[] = ['kind' => $r['kind'], 'id' => $r['id'], 'data' => $r['json'] !== null ? json_decode($r['json'], true) : null, 'updated' => (int) $r['updated'], 'deleted' => (bool) $r['deleted']];
        $last = (int) $r['rev'];
    }
    json_out(['ok' => true, 'accepted' => $accepted, 'rows' => $rows, 'rev' => $last, 'more' => $last < $rev]);
}

if (!preg_match('#^https://[^\s]+$#', $endpoint) || strlen($endpoint) > 1000) json_out(['error' => 'Inscrição de aviso inválida.'], 400);
$dev = device_id($endpoint);

switch ($action) {
    case 'sync':
        $alarms = is_array($in['alarms'] ?? null) ? array_slice($in['alarms'], 0, MAX_ALARMS) : [];
        $pdo->beginTransaction();
        $pdo->prepare('INSERT INTO devices (id, endpoint, updated) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, updated = excluded.updated')
            ->execute([$dev, $endpoint, $now]);
        // A lista nova substitui os avisos que ainda não tocaram; os que já tocaram ficam para não repetir.
        $pdo->prepare('DELETE FROM alarms WHERE device = ? AND notified = 0')->execute([$dev]);
        $ins = $pdo->prepare('INSERT OR IGNORE INTO alarms (device, aid, at, title, body) VALUES (?, ?, ?, ?, ?)');
        $n = 0;
        foreach ($alarms as $a) {
            $at = (int) ($a['at'] ?? 0);
            if ($at < $now - 60000) continue;
            $ins->execute([$dev, substr((string) ($a['id'] ?? $at), 0, 200), $at, mb_substr((string) ($a['title'] ?? 'Lembrete'), 0, 120), mb_substr((string) ($a['body'] ?? ''), 0, 400)]);
            $n++;
        }
        $pdo->commit();
        json_out(['ok' => true, 'count' => $n]);

    case 'pending':
        $q = $pdo->prepare('SELECT aid, at, title, body FROM alarms WHERE device = ? AND notified = 1 AND delivered = 0 ORDER BY at LIMIT 5');
        $q->execute([$dev]);
        $items = $q->fetchAll(PDO::FETCH_ASSOC);
        if ($items) {
            $upd = $pdo->prepare('UPDATE alarms SET delivered = 1 WHERE device = ? AND aid = ?');
            foreach ($items as $it) $upd->execute([$dev, $it['aid']]);
        }
        json_out(['ok' => true, 'items' => array_map(fn ($it) => ['id' => $it['aid'], 'title' => $it['title'], 'body' => $it['body']], $items)]);

    case 'test':
        $pdo->prepare('INSERT INTO devices (id, endpoint, updated) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint')
            ->execute([$dev, $endpoint, $now]);
        $pdo->prepare('INSERT OR REPLACE INTO alarms (device, aid, at, title, body, notified) VALUES (?, ?, ?, ?, ?, 1)')
            ->execute([$dev, 'teste-' . $now, $now, 'Teste do WDQ SmartPonto', 'Os avisos com o app fechado estão funcionando.']);
        $code = send_push($endpoint, $c);
        json_out(['ok' => $code >= 200 && $code < 300, 'status' => $code], $code >= 200 && $code < 300 ? 200 : 502);

    case 'unsubscribe':
        $pdo->prepare('DELETE FROM alarms WHERE device = ?')->execute([$dev]);
        $pdo->prepare('DELETE FROM devices WHERE id = ?')->execute([$dev]);
        json_out(['ok' => true]);
}
json_out(['error' => 'Ação desconhecida.'], 400);
