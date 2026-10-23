// Novidades de cada versão, mostradas ao usuário depois de atualizar. A primeira é a mais recente.
export const CHANGELOG = [
  {
    version: '1.9.2', date: '2026-10-24', title: 'Água opcional',
    items: [
      { icon: 'drop', title: 'Ligue a Água só se quiser', text: 'O controle de água vem desligado. Para usar, vá em Ajustes → Água e ative “Controle de água”. Desligando, somem o atalho e os avisos de água.' },
    ],
  },
  {
    version: '1.9.1', date: '2026-10-24', title: 'Água mais discreta',
    items: [
      { icon: 'drop', title: 'Atalho compacto na tela Ponto', text: 'Uma linha com o progresso do dia e o botão + para somar um copo. Toque na linha para abrir o controle completo de água.' },
    ],
  },
  {
    version: '1.9.0', date: '2026-10-24', title: 'Beba água, ganhe pontos',
    items: [
      { icon: 'drop', title: 'Controle de água na tela Ponto', text: 'Um copo que enche conforme você bebe. Toque em “Bebi água” a cada copo e acompanhe a semana.' },
      { icon: 'star', title: 'Meta diária com pontos', text: '10 pontos por dia com a meta batida, bônus por dias seguidos e níveis de Gota a Oceano.' },
      { icon: 'bell', title: 'Lembrete de beber água', text: 'Em Lembretes, toque em Ativar. Ele avisa de hora em hora no expediente e para quando você bate a meta.' },
    ],
  },
  {
    version: '1.8.0', date: '2026-10-23', title: 'Excluir várias marcações',
    items: [
      { icon: 'check', title: 'Selecionar várias de uma vez', text: 'Em “Marcações de hoje” ou no dia do Histórico, toque em Selecionar, escolha as marcações (ou Todas) e toque em Excluir. Errou? Toque em Desfazer.' },
      { icon: 'warn', title: 'Proteção contra toque repetido', text: 'Se você marcar de novo menos de 2 minutos depois da última marcação, o app pergunta antes de registrar.' },
    ],
  },
  {
    version: '1.7.1', date: '2026-10-23', title: 'Conexão no Android',
    items: [
      { icon: 'user', title: 'Entrar com e-mail no Android', text: 'O app Android agora se conecta ao servidor: o código de acesso chega no seu e-mail e as atualizações automáticas funcionam.' },
    ],
  },
  {
    version: '1.7.0', date: '2026-10-23', title: 'Atualizações automáticas',
    items: [
      { icon: 'sparkle', title: 'Android se atualiza sozinho', text: 'O app baixa as novidades ao abrir com internet e mostra “Atualização pronta · Reiniciar”. Não precisa mais baixar o APK a cada versão.' },
      { icon: 'sparkle', title: 'iPhone: versão nova ao reabrir', text: 'Ao fechar e abrir o app com internet, a versão mais recente já é carregada.' },
    ],
  },
  {
    version: '1.6.1', date: '2026-10-23', title: 'Servidor WDQ Brasil',
    items: [
      { icon: 'user', title: 'Entrar ficou mais fácil', text: 'Em Ajustes → Minha conta, basta digitar o e-mail e o código recebido.' },
      { icon: 'bell', title: 'Avisos com um toque', text: 'Em Ajustes → Avisos com o app fechado, toque em Ativar avisos e permita as notificações.' },
    ],
  },
  {
    version: '1.6.0', date: '2026-10-23', title: 'Sua conta, em todos os aparelhos',
    items: [
      { icon: 'user', title: 'Entrar com e-mail', text: 'Receba um código no e-mail e entre. Sem senha para lembrar.' },
      { icon: 'repeat', title: 'Lançamentos guardados na nuvem', text: 'Marcações, lembretes e ajustes ficam na sua conta e aparecem no Android e no iPhone.' },
      { icon: 'shield', title: 'Nada se perde', text: 'Ao entrar, tudo o que já está no app vai para a conta. Se dois aparelhos tiverem lançamentos, eles são juntados.' },
    ],
  },
  {
    version: '1.5.0', date: '2026-10-23', title: 'Avisos com o app fechado',
    items: [
      { icon: 'bell', title: 'Avisos no iPhone com o app fechado', text: 'Conecte um servidor seu (como Hostinger) em Ajustes e receba lembretes e alertas do ponto mesmo com o celular bloqueado.' },
      { icon: 'sparkle', title: 'Novidades e atualizações', text: 'A tela inicial avisa quando houver versão nova, e esta tela mostra o que mudou.' },
    ],
  },
  {
    version: '1.4.2', date: '2026-10-23', title: 'Alertas na Agenda do iPhone',
    items: [
      { icon: 'calendar', title: 'Alertas do ponto na Agenda', text: 'Entrada, almoço, volta e saída viram eventos da Agenda, que avisam na tela bloqueada.' },
      { icon: 'calendar', title: 'Adicionar à Agenda mais fácil', text: 'Passo a passo na tela, com opção de enviar o arquivo se a Agenda não abrir.' },
    ],
  },
  {
    version: '1.4.1', date: '2026-10-11', title: 'Horário de trabalho mais simples',
    items: [
      { icon: 'clock', title: 'Dias fixos ou escala', text: 'Escolha os dias e o horário, ou a escala (6x1, 12x36…) e o seu último dia de folga.' },
      { icon: 'calendar', title: 'Calendário dos próximos 14 dias', text: 'Confira de relance quando é trabalho e quando é folga.' },
    ],
  },
  {
    version: '1.3.0', date: '2026-10-11', title: 'Preencher pela jornada',
    items: [
      { icon: 'wand', title: 'Esqueceu de marcar?', text: 'Preencha um dia, vários dias de uma vez ou corrija um dia lançado errado com o seu horário.' },
    ],
  },
  {
    version: '1.2.0', date: '2026-10-10', title: 'Lembretes e pausas',
    items: [
      { icon: 'alarm', title: 'Lembretes com alarme', text: 'Todo dia, dias úteis, 1º dia útil do mês, de tempo em tempo e muito mais.' },
      { icon: 'meal', title: 'Refeição e pausas', text: 'Botão direto de refeição e pausas que contam como trabalho, como café e serviço externo.' },
    ],
  },
  {
    version: '1.0.0', date: '2026-10-09', title: 'Lançamento',
    items: [
      { icon: 'clock', title: 'WDQ SmartPonto', text: 'Ponto com um toque, banco de horas, relatórios em PDF e planilha, e backup.' },
    ],
  },
];

/** -1, 0 ou 1 comparando "1.4.2" com "1.5.0". */
export function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
}
