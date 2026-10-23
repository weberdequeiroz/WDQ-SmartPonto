# Servidor de avisos do WDQ SmartPonto

Com este servidor, o **iPhone recebe lembretes e alertas do ponto com o app fechado e a tela bloqueada**. Ele é pequeno, não precisa de banco de dados (usa um arquivo SQLite) e roda em qualquer hospedagem com PHP, como a **Hostinger**.

O que fica no servidor: só o título, o texto e o horário dos avisos dos próximos 10 dias e o endereço de notificação do seu iPhone. Suas marcações de ponto continuam só no celular.

## O que você precisa

- Hospedagem com **PHP 7.4 ou mais novo** (com as extensões `pdo_sqlite`, `openssl` e `curl`, padrão na Hostinger) e **Cron Jobs**.
- Um domínio com **https** (a Hostinger ativa o SSL grátis).
- iPhone com **iOS 16.4 ou mais novo**, com o SmartPonto instalado na **Tela de Início**.

## Instalação na Hostinger (cerca de 10 minutos)

1. **Baixe** o arquivo `SmartPonto-servidor.zip` na [última versão](https://github.com/weberdequeiroz/WDQ-SmartPonto/releases/latest).
2. No **hPanel**, abra **Arquivos → Gerenciador de Arquivos** e entre em `public_html` (ou na pasta do domínio).
3. Clique em **Enviar** e envie o zip. Clique com o botão direito nele → **Extrair**. Vai aparecer a pasta `smartponto-push`.
4. No navegador, abra `https://SEU-DOMINIO/smartponto-push/setup.php`.
   - A página confere o servidor. Se algo aparecer em vermelho, ajuste em **Avançado → Configuração do PHP** (versão 8.x e extensões).
   - Informe seu e-mail e toque em **Instalar**.
5. A página mostra:
   - **O link para o app.** Copie e guarde: ele funciona como a senha do servidor.
   - **O comando do Cron.** No hPanel, abra **Avançado → Cron Jobs**, escolha **PHP**, frequência **a cada minuto** e cole o caminho mostrado (ex.: `/home/u123456789/domains/seusite.com/public_html/smartponto-push/cron.php`).
6. No iPhone, abra o SmartPonto → **Ajustes → Avisos com o app fechado**, cole o link e toque em **Ativar avisos**. Permita as notificações.
7. Toque em **Enviar teste**. A notificação deve chegar em segundos.

## Como funciona

- Sempre que você abre o app, marca o ponto ou muda um lembrete, o app envia ao servidor a lista dos avisos dos próximos 10 dias.
- O Cron roda a cada minuto e envia a notificação dos avisos que chegaram no horário.
- Os alertas que dependem das marcações (ex.: “Jornada cumprida”) são recalculados quando você marca o ponto.
- Abra o app pelo menos a cada poucos dias para a lista continuar em dia.

## Problemas comuns

| Sintoma | O que fazer |
| --- | --- |
| “Link do servidor inválido” | Cole o link completo da página de instalação, com o final `?k=…`. |
| O teste não chega | Confira se o app está na Tela de Início, se as notificações do SmartPonto estão permitidas (Ajustes do iPhone → Notificações) e se o iOS é 16.4+. |
| Teste chega, avisos agendados não | O Cron não está rodando: confira em **Cron Jobs** se ele está ativo e a cada minuto. |
| Quero reinstalar | Apague a pasta `smartponto-push/data` pelo Gerenciador de Arquivos e abra `setup.php` de novo. |

A pasta `data` (chaves e avisos) é protegida e não pode ser baixada pelo navegador.
