<?php
// Rodar a cada minuto (Hostinger → Avançado → Cron Jobs). Envia os avisos que chegaram no horário.
declare(strict_types=1);
require __DIR__ . '/lib.php';

$c = config();
if (!$c) exit("Servidor não configurado.\n");
if (PHP_SAPI !== 'cli' && !hash_equals((string) $c['cron_key'], (string) ($_GET['ck'] ?? ''))) {
    http_response_code(403);
    exit('Acesso negado.');
}

$pdo = db();
$now = now_ms();
// Avisos atrasados mais de 30 min (servidor parado) não tocam mais.
$pdo->prepare('UPDATE alarms SET notified = 1, delivered = 1 WHERE notified = 0 AND at < ?')->execute([$now - 30 * 60000]);

$due = $pdo->prepare('SELECT DISTINCT a.device, d.endpoint FROM alarms a JOIN devices d ON d.id = a.device WHERE a.notified = 0 AND a.at <= ?');
$due->execute([$now + 20000]);
$sent = 0;
foreach ($due->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $pdo->prepare('UPDATE alarms SET notified = 1 WHERE device = ? AND notified = 0 AND at <= ?')->execute([$row['device'], $now + 20000]);
    $code = send_push($row['endpoint'], $c);
    if ($code === 404 || $code === 410) {
        // Inscrição expirada (app removido ou permissão retirada).
        $pdo->prepare('DELETE FROM alarms WHERE device = ?')->execute([$row['device']]);
        $pdo->prepare('DELETE FROM devices WHERE id = ?')->execute([$row['device']]);
    }
    $sent++;
}
$pdo->prepare('DELETE FROM alarms WHERE at < ?')->execute([$now - 2 * 86400000]);
if (PHP_SAPI === 'cli') echo date('c') . " · avisos enviados: $sent\n";
