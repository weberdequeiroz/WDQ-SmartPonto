<?php
// WDQ SmartPonto · servidor de avisos (Web Push), sem dependências: PHP 7.4+ com pdo_sqlite, openssl e curl.
declare(strict_types=1);

const DATA_DIR = __DIR__ . '/data';
const MAX_ALARMS = 500;

function config(): array
{
    $f = DATA_DIR . '/config.json';
    return is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
}

function save_config(array $c): void
{
    if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0700, true);
    file_put_contents(DATA_DIR . '/config.json', json_encode($c, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    @chmod(DATA_DIR . '/config.json', 0600);
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0700, true);
    $pdo = new PDO('sqlite:' . DATA_DIR . '/push.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, updated INTEGER NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS alarms (
        device TEXT NOT NULL, aid TEXT NOT NULL, at INTEGER NOT NULL, title TEXT, body TEXT,
        notified INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (device, aid))');
    $pdo->exec('CREATE INDEX IF NOT EXISTS alarms_due ON alarms (notified, at)');
    return $pdo;
}

function now_ms(): int
{
    return (int) floor(microtime(true) * 1000);
}

function b64u(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function device_id(string $endpoint): string
{
    return hash('sha256', $endpoint);
}

/** Cria o par de chaves VAPID (curva P-256). Devolve [chave privada PEM, chave pública base64url]. */
function vapid_generate(): array
{
    $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    if (!$key) throw new RuntimeException('openssl não conseguiu criar a chave: ' . openssl_error_string());
    openssl_pkey_export($key, $pem);
    $d = openssl_pkey_get_details($key);
    $pub = "\x04" . str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
    return [$pem, b64u($pub)];
}

/** Assinatura ECDSA em DER (openssl) → 64 bytes r||s (JWT ES256). */
function der_to_raw(string $der): string
{
    $pos = 2;
    if (ord($der[1]) & 0x80) $pos += ord($der[1]) & 0x7f;
    $out = '';
    for ($i = 0; $i < 2; $i++) {
        $len = ord($der[$pos + 1]);
        $int = substr($der, $pos + 2, $len);
        $out .= str_pad(ltrim($int, "\0"), 32, "\0", STR_PAD_LEFT);
        $pos += 2 + $len;
    }
    return $out;
}

function vapid_jwt(string $endpoint, array $c): string
{
    $u = parse_url($endpoint);
    $aud = $u['scheme'] . '://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');
    $head = b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = b64u(json_encode(['aud' => $aud, 'exp' => time() + 12 * 3600, 'sub' => $c['subject'] ?? 'mailto:avisos@example.com'], JSON_UNESCAPED_SLASHES));
    $data = "$head.$claims";
    if (!openssl_sign($data, $sig, $c['vapid_private_pem'], OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('falha ao assinar o aviso');
    }
    return $data . '.' . b64u(der_to_raw($sig));
}

/**
 * Envia um "toque" sem conteúdo ao aparelho. O service worker do app busca o texto em api.php?action=pending.
 * Devolve o código HTTP do serviço de push (201 = entregue; 404/410 = inscrição expirada).
 */
function send_push(string $endpoint, array $c): int
{
    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => '',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'TTL: 600',
            'Urgency: high',
            'Content-Length: 0',
            'Content-Type:',
            'Authorization: vapid t=' . vapid_jwt($endpoint, $c) . ', k=' . $c['vapid_public'],
        ],
    ]);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code;
}

function json_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function base_url(): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $dir . '/';
}
