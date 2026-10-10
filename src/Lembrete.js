/**
 * Lembrete.js – e-mail automático (Fase 5B).
 * Um gatilho diário (8h) chama verificarLembretesDiarios(). Em dia útil, envia um e-mail:
 *   - no 1º dia útil do mês: início da fiscalização da competência anterior, com o checklist;
 *   - depois do prazo de 10 dias úteis: competência ainda sem os 4 IDs do SEI.
 * O e-mail traz também as pendências atuais do painel. Cada aviso é enviado uma vez só
 * (registro no Log). Destinatários: chave EMAILS_LEMBRETE da aba Config.
 * Na homologação não há gatilho: use testarLembrete(), que envia só para quem executa.
 */

const NOME_REMETENTE = 'Fiscalização Técnica – Contrato 20/2025';
const HANDLER_LEMBRETE = 'verificarLembretesDiarios';

/** Executado pelo gatilho diário. Não depende de usuário logado. */
function verificarLembretesDiarios() {
  const feriados = {};
  (lerFeriados_() || []).forEach(function (d) { feriados[d] = true; });
  const hoje = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
  if (!ehDiaUtil_(hoje, feriados)) return 'Hoje não é dia útil: nada a enviar.';

  const enviados = lembretesEnviados_();
  const painel = montarPainel_();
  const motivos = [];

  const mesAtual = hoje.slice(0, 7);
  const compInicio = mesAnterior_(mesAtual);
  if (hoje === primeiroDiaUtilDoMes_(mesAtual, feriados) && !enviados['inicio/' + compInicio]) {
    motivos.push({ chave: 'inicio/' + compInicio, tipo: 'inicio', competencia: compInicio });
  }
  painel.competencias.forEach(function (c) {
    if (c.idsPreenchidos >= CAMPOS_IDS_SEI.length || enviados['prazo/' + c.competencia]) return;
    const prazo = prazoIdsSei_(c.competencia, feriados);
    if (hoje > prazo) motivos.push({ chave: 'prazo/' + c.competencia, tipo: 'prazo', competencia: c.competencia, prazo: prazo, faltando: c.idsFaltando });
  });
  if (!motivos.length) return 'Sem lembretes para hoje.';

  const destinatarios = destinatariosLembrete_();
  const email = montarEmailLembrete_(motivos, painel);
  enviarEmailLembrete_(destinatarios, email);

  comLock_(function () {
    incluir_(ABAS.LOG, motivos.map(function (m) {
      const log = montarLog_('LEMBRETE', 'Lembrete', m.chave, null, { destinatarios: destinatarios.join('; '), assunto: email.assunto });
      log.email = '(gatilho diário)';
      return log;
    }));
  });
  return 'Lembrete enviado para ' + destinatarios.join(', ') + ': ' + email.assunto;
}

/** Superadmin, só na produção: cria (ou recria) o gatilho diário das 8h. */
function instalarLembreteDiario() {
  requirePerfil_([PERFIS.SUPERADMIN]);
  if (ehHomologacao_()) {
    throw new Error('Na homologação o gatilho não é instalado, para não enviar e-mails automáticos. Use testarLembrete().');
  }
  destinatariosLembrete_();
  removerGatilhosLembrete_();
  ScriptApp.newTrigger(HANDLER_LEMBRETE).timeBased().everyDays(1).atHour(8).inTimezone(FUSO).create();
  gravarLog_('CONFIG', 'Gatilho', HANDLER_LEMBRETE, null, { gatilho: 'diário às 8h (' + FUSO + ')' });
  const msg = 'Gatilho do lembrete instalado: todos os dias às 8h; envia só em dia útil quando houver aviso.';
  console.log(msg);
  return msg;
}

/** Superadmin: remove o gatilho diário. */
function removerLembreteDiario() {
  requirePerfil_([PERFIS.SUPERADMIN]);
  const removidos = removerGatilhosLembrete_();
  if (removidos) gravarLog_('CONFIG', 'Gatilho', HANDLER_LEMBRETE, { gatilhos: removidos }, { gatilhos: 0 });
  const msg = removidos + ' gatilho(s) do lembrete removido(s).';
  console.log(msg);
  return msg;
}

/**
 * Superadmin: monta o e-mail como se hoje fosse o 1º dia útil (com os avisos de prazo
 * que existirem) e envia SÓ para quem executa. Não grava no Log nem bloqueia o envio real.
 */
function testarLembrete() {
  requirePerfil_([PERFIS.SUPERADMIN]);
  const feriados = {};
  (lerFeriados_() || []).forEach(function (d) { feriados[d] = true; });
  const hoje = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
  const painel = montarPainel_();
  const motivos = [{ tipo: 'inicio', competencia: mesAnterior_(hoje.slice(0, 7)) }];
  painel.competencias.forEach(function (c) {
    if (c.idsPreenchidos >= CAMPOS_IDS_SEI.length) return;
    const prazo = prazoIdsSei_(c.competencia, feriados);
    if (hoje > prazo) motivos.push({ tipo: 'prazo', competencia: c.competencia, prazo: prazo, faltando: c.idsFaltando });
  });
  const email = montarEmailLembrete_(motivos, painel);
  email.assunto = '[TESTE] ' + email.assunto;
  const para = Session.getEffectiveUser().getEmail();
  enviarEmailLembrete_([para], email);
  const msg = 'E-mail de teste enviado para ' + para + ': ' + email.assunto;
  console.log(msg);
  return msg;
}

/* ---------- Regras internas ---------- */

/** E-mails da chave EMAILS_LEMBRETE (separados por ";" ou ","). */
function destinatariosLembrete_() {
  const bruto = String(lerConfig_().EMAILS_LEMBRETE || '');
  const lista = bruto.split(/[;,]/).map(normalizarEmail_).filter(String);
  const invalidos = lista.filter(function (e) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); });
  if (!lista.length) throw new Error('A chave EMAILS_LEMBRETE da aba Config está vazia. Rode setup() ou preencha os e-mails.');
  if (invalidos.length) throw new Error('E-mails inválidos em EMAILS_LEMBRETE: ' + invalidos.join(', ') + '.');
  return lista;
}

/** Chaves de lembretes já enviados (Log, entidade "Lembrete"). */
function lembretesEnviados_() {
  const enviados = {};
  listar_(ABAS.LOG).forEach(function (l) {
    if (l.acao === 'LEMBRETE' && l.entidade === 'Lembrete') enviados[String(l.chave)] = true;
  });
  return enviados;
}

function removerGatilhosLembrete_() {
  let removidos = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === HANDLER_LEMBRETE) { ScriptApp.deleteTrigger(t); removidos++; }
  });
  return removidos;
}

/** Na homologação, o e-mail vai só para quem executa, com o prefixo [HOMOLOGAÇÃO]. */
function enviarEmailLembrete_(destinatarios, email) {
  let para = destinatarios;
  let assunto = email.assunto;
  if (ehHomologacao_()) {
    para = [Session.getEffectiveUser().getEmail()];
    assunto = '[HOMOLOGAÇÃO] ' + assunto;
  }
  MailApp.sendEmail({ to: para.join(','), subject: assunto, htmlBody: email.html, body: email.texto, name: NOME_REMETENTE });
}

/** motivos: [{ tipo: 'inicio' | 'prazo', competencia, prazo?, faltando? }] */
function montarEmailLembrete_(motivos, painel) {
  const url = ScriptApp.getService().getUrl() || '';
  const unidade = String(lerConfig_().UNIDADE_PAGAMENTO || 'unidade de pagamento');
  const inicio = motivos.filter(function (m) { return m.tipo === 'inicio'; })[0];
  const prazos = motivos.filter(function (m) { return m.tipo === 'prazo'; });

  const assunto = inicio
    ? 'Iniciar a fiscalização da competência ' + rotuloCompetencia_(inicio.competencia) + ' – Contrato 20/2025'
    : 'Prazo vencido: documentos SEI da competência ' + prazos.map(function (p) { return rotuloCompetencia_(p.competencia); }).join(', ');

  const blocos = [];
  if (inicio) {
    blocos.push({
      titulo: 'Hoje é o 1º dia útil: iniciar a competência ' + rotuloCompetencia_(inicio.competencia),
      itens: [
        'Extrair os relatórios do SZ.chat (Relatórios → Premium): logins, envio em lote e mensagens passivas.',
        'Apurar o ANS no Status da Fortics (fortics.statuspage.io, "View historical uptime").',
        'Consolidar os PDFs e salvar na pasta do mês no Drive.',
        'Lançar as quantidades e o ANS no app e enviar para conferência.',
        'Instruir o processo SEI: Relatório de Consumo de Itens, Relatório de Cumprimento do ANS, Atesto e Despacho.',
        'Encaminhar o processo à ' + unidade + ' e marcar como enviado para pagamento no app.'
      ]
    });
  }
  if (prazos.length) {
    blocos.push({
      titulo: 'Prazo de 10 dias úteis vencido sem os 4 documentos SEI',
      itens: prazos.map(function (p) {
        return 'Competência ' + rotuloCompetencia_(p.competencia) + ': prazo terminou em ' + dataBr_(p.prazo) +
          '. Faltam: ' + p.faltando.join(', ') + '.';
      })
    });
  }
  blocos.push({
    titulo: 'Pendências atuais do painel',
    itens: painel.alertas.length ? painel.alertas.map(function (a) { return a.texto; }) : ['Nenhuma pendência.']
  });

  const html = blocos.map(function (b) {
    return '<h3 style="font-family:Arial,sans-serif;font-size:15px;margin:16px 0 6px">' + escaparHtml_(b.titulo) + '</h3>' +
      '<ul style="font-family:Arial,sans-serif;font-size:14px;margin:0">' +
      b.itens.map(function (i) { return '<li>' + escaparHtml_(i) + '</li>'; }).join('') + '</ul>';
  }).join('') +
    (url ? '<p style="font-family:Arial,sans-serif;font-size:14px;margin-top:18px"><a href="' + escaparHtml_(url) + '">Abrir o app de fiscalização</a></p>' : '') +
    '<p style="font-family:Arial,sans-serif;font-size:12px;color:#666">E-mail automático do app de Fiscalização Técnica – Contrato TRE-MA nº 20/2025.</p>';

  const texto = blocos.map(function (b) {
    return b.titulo + '\n' + b.itens.map(function (i) { return '- ' + i; }).join('\n');
  }).join('\n\n') + (url ? '\n\nApp: ' + url : '');

  return { assunto: assunto, html: html, texto: texto };
}
