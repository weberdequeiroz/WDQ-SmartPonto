<?php
// Instalação: abra esta página uma vez no navegador. Ela confere o servidor, cria as chaves e mostra o link para o app.
declare(strict_types=1);
require __DIR__ . '/lib.php';

$checks = [
    'PHP 7.4 ou mais novo' => version_compare(PHP_VERSION, '7.4', '>='),
    'Extensão pdo_sqlite' => extension_loaded('pdo_sqlite'),
    'Extensão openssl' => extension_loaded('openssl'),
    'Extensão curl' => extension_loaded('curl'),
    'Pasta data/ com permissão de escrita' => (is_dir(DATA_DIR) || @mkdir(DATA_DIR, 0700, true)) && is_writable(DATA_DIR),
];
$okAll = !in_array(false, $checks, true);
$c = config();
$error = '';
$created = false;

if ($okAll && !$c && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    try {
        [$pem, $pub] = vapid_generate();
        $email = filter_var($_POST['email'] ?? '', FILTER_VALIDATE_EMAIL) ?: 'avisos@example.com';
        $from = filter_var($_POST['from'] ?? '', FILTER_VALIDATE_EMAIL);
        $c = [
            'vapid_private_pem' => $pem,
            'vapid_public' => $pub,
            'subject' => 'mailto:' . $email,
            'app_key' => bin2hex(random_bytes(16)),
            'cron_key' => bin2hex(random_bytes(16)),
            'created' => date('c'),
            'secret' => bin2hex(random_bytes(32)),
        ];
        if ($from) $c['mail_from'] = $from;
        save_config($c);
        db();
        $created = true;
    } catch (Throwable $e) {
        $error = $e->getMessage();
        $c = [];
    }
}
// Depois de instalado, os dados só aparecem para quem tem o link do app (?k=…).
$show = $c && ($created || hash_equals((string) $c['app_key'], (string) ($_GET['k'] ?? '')));
$base = base_url();
$appLink = $c ? $base . 'api.php?k=' . $c['app_key'] : '';
$cronUrl = $c ? $base . 'cron.php?ck=' . $c['cron_key'] : '';
$h = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES);
?><!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Servidor · WDQ SmartPonto</title>
<style>
  body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5fb;color:#0f172a}
  main{max-width:640px;margin:0 auto;padding:24px 16px}
  h1{font-size:22px;margin:0 0 4px}.sub{color:#5b6478;margin:0 0 20px}
  .card{background:#fff;border:1px solid #e1e4ef;border-radius:16px;padding:16px;margin-bottom:14px}
  .ok{color:#15803d}.no{color:#b91c1c}.step{font-weight:700;margin:0 0 6px}
  code,textarea{font:13px ui-monospace,Menlo,monospace;background:#eef0f8;border-radius:8px;padding:8px;display:block;width:100%;box-sizing:border-box;word-break:break-all;border:0}
  button{font:inherit;font-weight:700;border:0;border-radius:12px;padding:12px 18px;background:#4f46e5;color:#fff;width:100%}
  input{font:inherit;width:100%;box-sizing:border-box;padding:10px;border:1px solid #e1e4ef;border-radius:10px;margin:6px 0 12px}
  .hero{background:linear-gradient(140deg,#1e1b4b,#3730a3 55%,#7c3aed);color:#fff;border:0}
</style></head><body><main>
<div class="card hero"><h1>Servidor do WDQ SmartPonto</h1><p style="margin:0;opacity:.85">Login por e-mail, sincronização entre aparelhos e avisos com o app fechado</p></div>

<div class="card"><p class="step">Verificação do servidor</p>
<?php foreach ($checks as $label => $ok): ?><div class="<?= $ok ? 'ok' : 'no' ?>"><?= $ok ? '✓' : '✗' ?> <?= $h($label) ?></div><?php endforeach; ?>
<?php if (!$okAll): ?><p class="no">Corrija os itens em vermelho no painel da hospedagem (versão do PHP e extensões) e recarregue esta página.</p><?php endif; ?>
</div>

<?php if ($error): ?><div class="card no">Erro: <?= $h($error) ?></div><?php endif; ?>

<?php if ($okAll && !$c): ?>
<form class="card" method="post">
  <p class="step">Criar as chaves do servidor</p>
  <p>Seu e-mail (os serviços de notificação da Apple e do Google usam para contato técnico):</p>
  <input type="email" name="email" placeholder="voce@email.com">
  <p>E-mail remetente dos códigos de login (crie em <b>E-mails</b> no hPanel, do seu domínio):</p>
  <input type="email" name="from" placeholder="no-reply@seudominio.com">
  <button type="submit">Instalar</button>
</form>
<?php elseif ($show): ?>
<div class="card"><p class="step">1. Cole este link no app</p>
  <p>No iPhone, abra o WDQ SmartPonto → <b>Ajustes → Avisos com o app fechado</b>, cole o link e toque em <b>Ativar</b>.</p>
  <textarea rows="3" readonly onclick="this.select()"><?= $h($appLink) ?></textarea>
  <p style="color:#b91c1c;font-size:14px">Guarde este link: ele é a senha do seu servidor. Esta página só mostra os dados de novo para quem abrir com <code style="display:inline;padding:2px 4px">?k=</code> do link.</p>
</div>
<div class="card"><p class="step">2. Programe o envio a cada minuto</p>
  <p>Na Hostinger: <b>hPanel → Avançado → Cron Jobs</b> → tipo <b>PHP</b> (ou “Personalizado”), frequência <b>a cada minuto</b> (* * * * *), com o comando:</p>
  <code>php <?= $h(__DIR__ . '/cron.php') ?></code>
  <p>Se o painel pedir um endereço em vez de comando, use:</p>
  <code><?= $h($cronUrl) ?></code>
</div>
<div class="card"><p class="step">3. Teste</p><p>No app, toque em <b>Enviar teste</b>. A notificação chega em segundos.</p></div>
<div class="card"><p class="step">4. Login por e-mail</p>
  <p>Remetente dos códigos: <b><?= $h($c['mail_from'] ?? ('no-reply@' . preg_replace('/^www\./', '', (string) ($_SERVER['HTTP_HOST'] ?? '')))) ?></b>. Ele precisa existir em <b>E-mails</b> no hPanel para os códigos não caírem no spam.</p>
  <p>No app: <b>Ajustes → Minha conta</b> → digite o e-mail → digite o código recebido.</p></div>
<?php else: ?>
<div class="card"><p class="step">Servidor já instalado.</p><p>Para ver o link de novo, abra esta página com o final <code style="display:inline;padding:2px 4px">?k=</code> do link do app. Para reinstalar do zero, apague a pasta <b>data</b> pelo Gerenciador de Arquivos.</p></div>
<?php endif; ?>
</main></body></html>
