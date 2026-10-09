<p align="center"><img src="web/icons/wordmark.png" alt="WDQ SmartPonto" width="460"></p>

# WDQ SmartPonto

Controle pessoal de ponto para **Android e iPhone**. Abra, toque em **Entrada**, **Intervalo**, **Retorno** ou **Saída**, e o app registra o horário. Gera relatórios por dia, semana, mês, ano ou qualquer período.

Os dados ficam só no aparelho, sem conta e sem servidor, e o app funciona sem internet.

## Como instalar

| Aparelho | Como |
| --- | --- |
| **Android** | Baixe `SmartPonto.apk` na [última Release](../../releases/latest) e instale (permita "instalar apps desconhecidos"). |
| **iPhone** | Abra o endereço do GitHub Pages no **Safari** → **Compartilhar** → **Adicionar à Tela de Início**. O app abre em tela cheia, como um app nativo. |
| **Android sem APK** | Abra o mesmo endereço no Chrome → menu → **Instalar app**. |

> A Apple não permite instalar APK nem apps fora da App Store sem conta de desenvolvedor paga. Por isso o iPhone usa a versão web instalável (PWA), com as mesmas telas e funções.

Para publicar o endereço do iPhone: no GitHub, **Settings → Pages → Source: GitHub Actions**, e rode o workflow **Publicar SmartPonto** (ele também roda sozinho a cada mudança em `web/`). O endereço fica em `https://<usuário>.github.io/<repositório>/`. Em repositório privado, o GitHub Pages exige um plano pago.

## Funções

| Tela | O que tem |
| --- | --- |
| **Ponto** | Relógio, situação atual (trabalhando, em intervalo, fora), botão principal com a próxima marcação, motivo do intervalo (refeição, café, pessoal, médico…), horas do dia, saída prevista, progresso da jornada, banco de horas e marcações de hoje. Botão **Desfazer** logo após marcar. |
| **Histórico** | Mês a mês, cada dia com seus horários e saldo. Toque no dia para corrigir, incluir marcação esquecida ou lançar **folga, feriado, férias, atestado, abono ou falta**. |
| **Relatórios** | Dia, semana, mês, ano ou período livre: trabalhado, previsto, saldo, horas extras, débito, média por dia, faltas e abonos, gráfico e tabela. Exporta **PDF** (espelho de ponto com campos de assinatura), **planilha CSV** (Excel / Google Planilhas) e **resumo em texto**. |
| **Ajustes** | Nome, empresa, cargo e matrícula; jornada por dia da semana (modelos de 30h, 36h, 40h e 44h); tolerância diária (padrão de 10 min, CLT art. 58 §1º); saldo inicial do banco de horas; confirmação antes de marcar; localização opcional; tema claro/escuro; backup. |

Também alerta sobre saída não registrada, intervalo menor que 1h em jornada acima de 6h e mais de 10h trabalhadas no dia. Turnos noturnos que passam da meia-noite contam no dia da entrada.

## Backup

- **Fazer backup e enviar**: gera um arquivo `.json` e abre o compartilhamento (Google Drive, iCloud, e-mail, WhatsApp).
- **Salvar backup no aparelho**: no Android, salva em `Downloads/SmartPonto`.
- **Restaurar**: junta com os dados atuais ou substitui tudo.
- O app lembra de fazer backup a cada 7 dias (ajustável). No Android, os dados também entram no backup automático do Google.

## Identidade visual

Relógio com um visto dourado, sobre gradiente índigo e violeta. Os arquivos estão em `web/icons/` (`icon.svg`, `maskable.svg`, `wordmark.svg` e os PNGs). O app é independente e não tem vínculo com nenhuma empresa.

## Estrutura

```
WDQ-SmartPonto/
├── web/          App (HTML, CSS, JavaScript puro): usado no iPhone, no navegador e dentro do APK
│   ├── js/calc.js      cálculos de jornada, saldo e relatórios
│   ├── js/store.js     armazenamento local (IndexedDB) e backup
│   ├── js/platform.js  compartilhar, salvar, imprimir (navegador ou ponte Android)
│   └── js/app.js       telas
├── app/          APK: WebView que carrega web/ e oferece compartilhamento, Downloads e PDF
└── tests/        testes dos cálculos (node --test tests/*.mjs)
```

A cada push no `main`, o workflow **Build e Release** testa, gera o APK e publica uma Release. Para testar a versão web localmente: `cd web && python3 -m http.server`, e abra `http://localhost:8000`.

**Aviso:** este app serve para controle pessoal e não substitui o registro de ponto oficial do empregador (Portaria MTP 671/2021).
