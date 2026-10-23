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

if ($action === 'info') json_out(['ok' => true, 'vapid' => $c['vapid_public']]);

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
