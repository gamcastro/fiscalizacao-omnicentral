/**
 * Setup.js – criação das abas e dos dados iniciais (SPEC, seção 3).
 * Rodar uma vez pelo editor do Apps Script, com a conta do superadmin.
 * Pode ser rodado de novo: não apaga nem altera nada que já exista.
 */

/** Formatos de exibição das colunas de data, aplicados quando a aba é criada. */
const FORMATOS_SETUP = {
  Usuarios: { criadoEm: 'dd/mm/yyyy hh:mm', atualizadoEm: 'dd/mm/yyyy hh:mm' },
  Vigencias: { inicio: 'dd/mm/yyyy', fim: 'dd/mm/yyyy' },
  Competencias: {
    dataEnvioCogecon: 'dd/mm/yyyy', cienteGestorEm: 'dd/mm/yyyy hh:mm',
    criadoEm: 'dd/mm/yyyy hh:mm', atualizadoEm: 'dd/mm/yyyy hh:mm'
  },
  Medicoes: { criadoEm: 'dd/mm/yyyy hh:mm', atualizadoEm: 'dd/mm/yyyy hh:mm' },
  Feriados: { data: 'dd/mm/yyyy' },
  Log: { timestamp: 'dd/mm/yyyy hh:mm:ss' }
};

const DADOS_INICIAIS = {
  Config: [
    { chave: 'CONTRATO', valor: '20/2025', descricao: '' },
    { chave: 'EMPRESA', valor: 'Omnicentral Tecnologia Ltda', descricao: '' },
    { chave: 'CNPJ', valor: '23.109.142/0001-97', descricao: '' },
    {
      chave: 'OBJETO_ATESTO',
      valor: 'licenciamento de uso de software como serviço (SaaS) em ambiente de nuvem para atendimento multicanal (omnichannel), com chatbot incorporado e integração via API',
      descricao: 'Usado no texto do atesto'
    },
    { chave: 'VIGENCIA_ATUAL', valor: 'V2026', descricao: 'id da aba Vigencias' },
    { chave: 'ANS_LIMITE_MIN', valor: 45, descricao: '' },
    { chave: 'ANS_PERCENTUAL', valor: 99.741, descricao: 'Referência do TR' },
    { chave: 'ALERTA_SALDO', valor: 0.8, descricao: '80%' },
    { chave: 'SEI_PAGAMENTO', valor: '0006617-02.2025.6.27.8000', descricao: '' },
    {
      chave: 'UNIDADE_PAGAMENTO', valor: 'ASGEC',
      descricao: 'Unidade destinatária do despacho de pagamento (ASGEC desde a competência 09/2026; antes, COGECON)'
    },
    { chave: 'FISCAL_TECNICO_ASSINATURA', valor: 'George André Melo Castro', descricao: 'Nome no rodapé do atesto e do despacho' }
  ],
  Itens: [
    { item: 1, descricao: 'Subscrição WhatsApp API Oficial (BSP)', unidade: 'Assinatura mensal', tipo: 'FIXO', fonte: '—' },
    { item: 2, descricao: 'Solução de atendimento humano com mensagens ilimitadas', unidade: 'Ativação/mês', tipo: 'CONSUMO', fonte: 'Relatório de logins (e-mails únicos no período)' },
    { item: 3, descricao: 'Serviço de atendimento por chatbot com interações ilimitadas', unidade: 'Assinatura mensal', tipo: 'FIXO', fonte: '—' },
    { item: 4, descricao: 'Mensagem passiva de atendimento via WhatsApp', unidade: 'Conversa 24h', tipo: 'CONSUMO', fonte: 'Relatório de mensagens passivas (total de atendimentos)' },
    { item: 5, descricao: 'Mensagem ativa via WhatsApp (template HSM)', unidade: 'Mensagem', tipo: 'CONSUMO', fonte: 'Relatório de envio em lote (total, sem campanhas de teste)' },
    { item: 6, descricao: 'Pacote adicional de videochamadas simultâneas (+5 agentes)', unidade: 'Pacote', tipo: 'EVENTUAL', fonte: '—' },
    { item: 7, descricao: 'Serviço de integração e desenvolvimento', unidade: 'Hora', tipo: 'EVENTUAL', fonte: '—' },
    { item: 8, descricao: 'Serviço de implantação e configuração', unidade: 'Serviço', tipo: 'EVENTUAL', fonte: '—' },
    { item: 9, descricao: 'Serviço de treinamento', unidade: 'Serviço', tipo: 'EVENTUAL', fonte: '—' }
  ],
  Vigencias: [
    {
      id: 'V2026', inicio: new Date(2026, 6, 1), fim: new Date(2027, 5, 30),
      documento: '2º Termo Aditivo (SEI 2783528)', observacao: 'Reajuste pela Apostila nº 1 (SEI 2861311)'
    }
  ],
  QuantidadesContratadas: [
    { vigencia: 'V2026', item: 1, qtdContratada: 12 },
    { vigencia: 'V2026', item: 2, qtdContratada: 3400 },
    { vigencia: 'V2026', item: 3, qtdContratada: 12 },
    { vigencia: 'V2026', item: 4, qtdContratada: 400000 },
    { vigencia: 'V2026', item: 5, qtdContratada: 500000 },
    { vigencia: 'V2026', item: 6, qtdContratada: 5 },
    { vigencia: 'V2026', item: 7, qtdContratada: 720 },
    { vigencia: 'V2026', item: 8, qtdContratada: 1 },
    { vigencia: 'V2026', item: 9, qtdContratada: 1 }
  ],
  PrecosReferencia: [
    { vigencia: 'V2026', item: 1, valorUnitario: 547.91, documento: 'Apostila nº 1' },
    { vigencia: 'V2026', item: 2, valorUnitario: 54.791, documento: 'Apostila nº 1' },
    { vigencia: 'V2026', item: 3, valorUnitario: 2410.80, documento: 'Apostila nº 1' },
    { vigencia: 'V2026', item: 4, valorUnitario: 0.23012207, documento: 'Apostila nº 1' },
    { vigencia: 'V2026', item: 5, valorUnitario: 0.10958194, documento: 'Apostila nº 1' },
    { vigencia: 'V2026', item: 6, valorUnitario: 109.58, documento: 'Apostila nº 1' },
    { vigencia: 'V2026', item: 7, valorUnitario: 53.695, documento: 'Apostila nº 1' },
    { vigencia: 'V2026', item: 8, valorUnitario: 5479.05, documento: 'Apostila nº 1' },
    { vigencia: 'V2026', item: 9, valorUnitario: 1095.80, documento: 'Apostila nº 1' }
  ]
};

const SUPERADMIN_INICIAL = {
  email: 'george.castro@tre-ma.jus.br',
  nome: 'George André Melo Castro',
  perfil: 'SUPERADMIN',
  condicao: 'Titular'
};

/** Abas que recebem os dados iniciais só quando estão sem nenhuma linha de dados. */
const ABAS_CARGA_SE_VAZIA = ['Itens', 'Vigencias', 'QuantidadesContratadas', 'PrecosReferencia'];

function setup() {
  const resumo = comLock_(function () {
    const ss = planilha_();
    const resumo = [];
    const comProblema = {};
    const logs = [];

    // 0. Fuso da planilha igual ao do script, para as datas não mudarem de dia
    const fusoAnterior = ss.getSpreadsheetTimeZone();
    if (fusoAnterior !== FUSO) {
      ss.setSpreadsheetTimeZone(FUSO);
      logs.push(montarLog_('CONFIG', 'Planilha', 'fusoHorario', { fuso: fusoAnterior }, { fuso: FUSO }));
      resumo.push('Fuso da planilha alterado de ' + fusoAnterior + ' para ' + FUSO + '.');
    }

    // 1. Abas e cabeçalhos
    Object.keys(CABECALHOS).forEach(function (nome) {
      const sh = ss.getSheetByName(nome);
      if (!sh) {
        criarAba_(ss, nome);
        resumo.push('Aba criada: ' + nome);
        return;
      }
      const cabecalho = lerCabecalho_(sh);
      const faltando = CABECALHOS[nome].filter(function (c) { return cabecalho.indexOf(c) < 0; });
      if (faltando.length) {
        comProblema[nome] = true;
        resumo.push('ATENÇÃO: a aba ' + nome + ' já existe, mas está sem as colunas ' + faltando.join(', ') +
          '. Nada foi alterado nela.');
      } else {
        resumo.push('Aba já existia: ' + nome);
      }
    });

    if (comProblema[ABAS.LOG]) {
      throw new Error('A aba Log está com o cabeçalho incompleto. Corrija antes de rodar setup(). ' + resumo.join(' | '));
    }

    // 2. Dados iniciais
    if (!comProblema[ABAS.CONFIG]) {
      const chavesExistentes = listar_(ABAS.CONFIG).map(function (c) { return String(c.chave).trim(); });
      const novas = DADOS_INICIAIS.Config.filter(function (c) { return chavesExistentes.indexOf(c.chave) < 0; });
      incluirComLog_(ABAS.CONFIG, novas, logs);
      resumo.push('Config: ' + novas.length + ' chave(s) incluída(s).');
    }

    if (!comProblema[ABAS.USUARIOS]) {
      if (buscarUsuario_(SUPERADMIN_INICIAL.email)) {
        resumo.push('Usuarios: superadmin já cadastrado.');
      } else {
        const agora = new Date();
        const autor = emailAtual_() || SUPERADMIN_INICIAL.email;
        const superadmin = Object.assign({}, SUPERADMIN_INICIAL, {
          ativo: true, criadoEm: agora, criadoPor: autor, atualizadoEm: agora, atualizadoPor: autor
        });
        incluirComLog_(ABAS.USUARIOS, [superadmin], logs);
        resumo.push('Usuarios: superadmin incluído.');
      }
    }

    ABAS_CARGA_SE_VAZIA.forEach(function (nome) {
      if (comProblema[nome]) return;
      if (listar_(nome).length) {
        resumo.push(nome + ': já tinha dados, nada incluído.');
        return;
      }
      incluirComLog_(nome, DADOS_INICIAIS[nome], logs);
      resumo.push(nome + ': ' + DADOS_INICIAIS[nome].length + ' linha(s) incluída(s).');
    });

    incluir_(ABAS.LOG, logs);
    resumo.push('Log: ' + logs.length + ' registro(s) gravado(s).');
    return resumo;
  });

  console.log(resumo.join('\n'));
  return resumo;
}

/**
 * Migração (rodar uma vez): o primeiro setup() gravou as datas da aba Vigencias
 * com a planilha em outro fuso, e elas ficaram um dia antes. Acerta o fuso da
 * planilha e corrige inicio/fim conforme os dados iniciais, registrando no Log.
 */
function corrigirFusoHorario() {
  const resumo = comLock_(function () {
    const ss = planilha_();
    const resumo = [];
    const logs = [];

    const fusoAnterior = ss.getSpreadsheetTimeZone();
    if (fusoAnterior !== FUSO) {
      ss.setSpreadsheetTimeZone(FUSO);
      logs.push(montarLog_('CONFIG', 'Planilha', 'fusoHorario', { fuso: fusoAnterior }, { fuso: FUSO }));
      resumo.push('Fuso da planilha alterado de ' + fusoAnterior + ' para ' + FUSO + '.');
    } else {
      resumo.push('Fuso da planilha já era ' + FUSO + '.');
    }

    const formatar = function (d) {
      return (d instanceof Date) ? Utilities.formatDate(d, FUSO, 'dd/MM/yyyy') : String(d);
    };
    listar_(ABAS.VIGENCIAS).forEach(function (v) {
      const esperado = DADOS_INICIAIS.Vigencias.find(function (e) { return e.id === String(v.id).trim(); });
      if (!esperado) return;
      const alteracoes = {};
      ['inicio', 'fim'].forEach(function (campo) {
        if (formatar(v[campo]) !== formatar(esperado[campo])) alteracoes[campo] = esperado[campo];
      });
      if (!Object.keys(alteracoes).length) {
        resumo.push('Vigencias ' + v.id + ': datas já corretas.');
        return;
      }
      atualizar_(ABAS.VIGENCIAS, v._linha, alteracoes);
      const antes = { id: v.id, inicio: formatar(v.inicio), fim: formatar(v.fim) };
      const depois = { id: v.id, inicio: formatar(esperado.inicio), fim: formatar(esperado.fim) };
      logs.push(montarLog_('EDITAR', ABAS.VIGENCIAS, v.id, antes, depois));
      resumo.push('Vigencias ' + v.id + ': ' + antes.inicio + ' a ' + antes.fim +
        ' corrigido para ' + depois.inicio + ' a ' + depois.fim + '.');
    });

    incluir_(ABAS.LOG, logs);
    resumo.push('Log: ' + logs.length + ' registro(s) gravado(s).');
    return resumo;
  });

  console.log(resumo.join('\n'));
  return resumo;
}

/**
 * Migração (rodar uma vez): o criadoEm/atualizadoEm do superadmin foi gravado
 * pelo primeiro setup() com a planilha em America/Los_Angeles e ficou 4 h atrasado.
 * Só corrige datas anteriores à troca de fuso e registra a correção no Log.
 */
function corrigirHorarioSuperadmin() {
  const FUSO_ANTIGO = 'America/Los_Angeles';
  const MOTIVO = 'Correção de fuso: gravado com a planilha em ' + FUSO_ANTIGO;
  const resumo = comLock_(function () {
    const email = SUPERADMIN_INICIAL.email;
    const log = listar_(ABAS.LOG);
    const jaCorrigido = log.some(function (l) {
      return l.entidade === ABAS.USUARIOS && String(l.chave) === email &&
        l.acao === 'EDITAR' && String(l.depois).indexOf(MOTIVO) >= 0;
    });
    if (jaCorrigido) return ['O horário do superadmin já foi corrigido antes. Nada alterado.'];

    const trocaFuso = log.find(function (l) {
      return l.entidade === 'Planilha' && String(l.chave) === 'fusoHorario' &&
        String(l.antes).indexOf(FUSO_ANTIGO) >= 0;
    });
    if (!trocaFuso) return ['Não há registro da troca de fuso no Log. Nada alterado.'];

    const usuario = buscarUsuario_(email);
    if (!usuario) return ['Superadmin não encontrado. Nada alterado.'];

    const formato = 'yyyy-MM-dd HH:mm:ss';
    const alteracoes = {};
    ['criadoEm', 'atualizadoEm'].forEach(function (campo) {
      const valor = usuario[campo];
      if (!(valor instanceof Date) || valor >= trocaFuso.timestamp) return;
      alteracoes[campo] = Utilities.parseDate(Utilities.formatDate(valor, FUSO, formato), FUSO_ANTIGO, formato);
    });
    if (!Object.keys(alteracoes).length) return ['Sem datas para corrigir.'];

    atualizar_(ABAS.USUARIOS, usuario._linha, alteracoes);
    const antes = paraCliente_(usuario);
    const depois = Object.assign({}, antes, paraCliente_(alteracoes), { motivo: MOTIVO });
    gravarLog_('EDITAR', ABAS.USUARIOS, email, antes, depois);
    return ['Superadmin: criadoEm ' + antes.criadoEm + ' corrigido para ' + depois.criadoEm + '.',
      'Log: 1 registro gravado.'];
  });

  console.log(resumo.join('\n'));
  return resumo;
}

/**
 * SOMENTE HOMOLOGAÇÃO: apaga uma competência de teste (Competencias, Medicoes e as
 * linhas do Log ligadas a ela), para refazer o processo do zero. Recusa rodar no
 * script de produção, onde a regra "nada é apagado" vale sempre.
 * O editor não passa parâmetros: use os atalhos abaixo (ex.: limparSetembro2026Homologacao).
 */
function limparCompetenciaHomologacao(competencia) {
  if (!ehHomologacao_()) {
    throw new Error('Esta função só pode ser usada no ambiente de HOMOLOGAÇÃO. Nada foi apagado.');
  }
  requirePerfil_([PERFIS.SUPERADMIN]);
  const comp = validarFormatoCompetencia_(competencia);

  const resumo = comLock_(function () {
    const pertence = {
      Competencias: function (l) { return textoCompetencia_(l.competencia) === comp; },
      Medicoes: function (l) { return textoCompetencia_(l.competencia) === comp; },
      // Só linhas de Competencias/Medicoes: as chaves dos feriados (ex.: 2026-09-07) não entram.
      Log: function (l) {
        const chave = String(l.chave);
        return (l.entidade === ABAS.COMPETENCIAS || l.entidade === ABAS.MEDICOES) &&
          (chave === comp || chave.indexOf(comp + '/') === 0);
      }
    };
    const apagadas = {};
    Object.keys(pertence).forEach(function (nome) {
      const sh = getAba_(nome);
      const linhas = listar_(nome).filter(pertence[nome]).map(function (l) { return l._linha; });
      linhas.sort(function (a, b) { return b - a; }).forEach(function (n) { sh.deleteRow(n); });
      apagadas[nome] = linhas.length;
    });
    gravarLog_('LIMPEZA_HOMOLOGACAO', ABAS.COMPETENCIAS, comp, { linhasApagadas: apagadas }, null);
    return [
      'Competência ' + comp + ' apagada da HOMOLOGAÇÃO.',
      'Competencias: ' + apagadas.Competencias + ' linha(s), Medicoes: ' + apagadas.Medicoes +
        ' linha(s), Log: ' + apagadas.Log + ' linha(s).',
      'Log: 1 registro da limpeza gravado.'
    ];
  });

  console.log(resumo.join('\n'));
  return resumo;
}

/** Atalho para o editor: limpa a competência 09/2026 da homologação. */
function limparSetembro2026Homologacao() {
  return limparCompetenciaHomologacao('2026-09');
}

function criarAba_(ss, nome) {
  const sh = ss.insertSheet(nome);
  const cabecalho = CABECALHOS[nome];
  sh.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const formatos = FORMATOS_SETUP[nome] || {};
  Object.keys(formatos).forEach(function (coluna) {
    const indice = cabecalho.indexOf(coluna) + 1;
    sh.getRange(2, indice, sh.getMaxRows() - 1, 1).setNumberFormat(formatos[coluna]);
  });
  return sh;
}

function incluirComLog_(nome, objs, logs) {
  if (!objs.length) return;
  incluir_(nome, objs);
  objs.forEach(function (o) {
    logs.push(montarLog_('CONFIG', nome, chaveSetup_(nome, o), null, o));
  });
}

function chaveSetup_(nome, o) {
  switch (nome) {
    case ABAS.CONFIG: return o.chave;
    case ABAS.USUARIOS: return o.email;
    case ABAS.ITENS: return o.item;
    case ABAS.VIGENCIAS: return o.id;
    default: return o.vigencia + '/' + o.item;
  }
}
