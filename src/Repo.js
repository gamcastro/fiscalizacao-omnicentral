/**
 * Repo.js – leitura e gravação nas abas da planilha.
 * As colunas são sempre localizadas pelo nome do cabeçalho (linha 1).
 */

const FUSO = 'America/Sao_Paulo';

const ABAS = {
  CONFIG: 'Config',
  USUARIOS: 'Usuarios',
  ITENS: 'Itens',
  VIGENCIAS: 'Vigencias',
  QTD_CONTRATADAS: 'QuantidadesContratadas',
  PRECOS: 'PrecosReferencia',
  COMPETENCIAS: 'Competencias',
  MEDICOES: 'Medicoes',
  FERIADOS: 'Feriados',
  LOG: 'Log'
};

/** Cabeçalhos esperados de cada aba (SPEC, seção 3). */
const CABECALHOS = {
  Config: ['chave', 'valor', 'descricao'],
  Usuarios: ['email', 'nome', 'perfil', 'condicao', 'ativo', 'criadoEm', 'criadoPor', 'atualizadoEm', 'atualizadoPor'],
  Itens: ['item', 'descricao', 'unidade', 'tipo', 'fonte'],
  Vigencias: ['id', 'inicio', 'fim', 'documento', 'observacao'],
  QuantidadesContratadas: ['vigencia', 'item', 'qtdContratada'],
  PrecosReferencia: ['vigencia', 'item', 'valorUnitario', 'documento'],
  Competencias: ['competencia', 'vigencia', 'status', 'ansUptimePct', 'ansMinutos', 'ansCumprido', 'ansObs',
    'idRelConsumo', 'idRelANS', 'idAtesto', 'idDespacho', 'dataEnvioCogecon', 'pastaDrive',
    'cienteGestorPor', 'cienteGestorEm', 'obs', 'criadoEm', 'criadoPor', 'atualizadoEm', 'atualizadoPor'],
  Medicoes: ['competencia', 'item', 'quantidade', 'quantidadeRelatorio', 'ajusteObs',
    'criadoEm', 'criadoPor', 'atualizadoEm', 'atualizadoPor'],
  Feriados: ['data', 'descricao'],
  Log: ['timestamp', 'email', 'acao', 'entidade', 'chave', 'antes', 'depois']
};

function planilha_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getAba_(nome) {
  const sh = planilha_().getSheetByName(nome);
  if (!sh) {
    throw new Error('A aba "' + nome + '" não existe. Peça ao superadmin para rodar setup().');
  }
  return sh;
}

function lerCabecalho_(sh) {
  const ultimaColuna = sh.getLastColumn();
  if (ultimaColuna === 0) return [];
  return sh.getRange(1, 1, 1, ultimaColuna).getValues()[0].map(function (v) {
    return String(v).trim();
  });
}

/** Lê o cabeçalho e confere se todas as colunas esperadas existem. */
function cabecalhoValidado_(nome, sh) {
  const cabecalho = lerCabecalho_(sh);
  const faltando = (CABECALHOS[nome] || []).filter(function (c) {
    return cabecalho.indexOf(c) < 0;
  });
  if (faltando.length) {
    throw new Error('A aba "' + nome + '" está sem as colunas: ' + faltando.join(', ') + '.');
  }
  return cabecalho;
}

/** Retorna as linhas de dados da aba como objetos { coluna: valor, _linha }. */
function listar_(nome) {
  const sh = getAba_(nome);
  const cabecalho = cabecalhoValidado_(nome, sh);
  const ultimaLinha = sh.getLastRow();
  if (ultimaLinha < 2) return [];
  const valores = sh.getRange(2, 1, ultimaLinha - 1, cabecalho.length).getValues();
  const linhas = [];
  valores.forEach(function (valoresLinha, i) {
    const vazia = valoresLinha.every(function (v) { return v === '' || v === null; });
    if (vazia) return;
    const obj = { _linha: i + 2 };
    cabecalho.forEach(function (c, j) {
      if (c) obj[c] = valoresLinha[j];
    });
    linhas.push(obj);
  });
  return linhas;
}

/** Inclui objetos no fim da aba, na ordem do cabeçalho. */
function incluir_(nome, objs) {
  if (!objs || !objs.length) return;
  const sh = getAba_(nome);
  const cabecalho = cabecalhoValidado_(nome, sh);
  const linhas = objs.map(function (o) {
    return cabecalho.map(function (c) { return paraCelula_(c ? o[c] : ''); });
  });
  sh.getRange(sh.getLastRow() + 1, 1, linhas.length, cabecalho.length).setValues(linhas);
}

/** Atualiza só as colunas informadas em `alteracoes` na linha indicada. */
function atualizar_(nome, linha, alteracoes) {
  const sh = getAba_(nome);
  const cabecalho = cabecalhoValidado_(nome, sh);
  const intervalo = sh.getRange(linha, 1, 1, cabecalho.length);
  const atual = intervalo.getValues()[0];
  const nova = cabecalho.map(function (c, j) {
    const valor = (c && Object.prototype.hasOwnProperty.call(alteracoes, c)) ? alteracoes[c] : atual[j];
    return paraCelula_(valor);
  });
  intervalo.setValues([nova]);
}

/**
 * Exclui linhas de uma aba (da maior para a menor, para os números não mudarem).
 * Uso restrito a dados de configuração (feriados, vigências, quantidades), sempre com Log.
 * Competências e medições nunca são excluídas na produção.
 */
function excluirLinhas_(nome, linhas) {
  const sh = getAba_(nome);
  linhas.slice().sort(function (a, b) { return b - a; }).forEach(function (n) { sh.deleteRow(n); });
}

/**
 * Prepara um valor para gravação. Textos recebem apóstrofo para a planilha
 * não convertê-los (ex.: "20/2025" virar data ou "=..." virar fórmula).
 */
function paraCelula_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v === '' ? '' : "'" + v;
  return v;
}

/** Copia o objeto sem `_linha` e com datas em string ISO, para o front-end e o Log. */
function paraCliente_(obj) {
  if (!obj) return null;
  const copia = {};
  Object.keys(obj).forEach(function (k) {
    if (k === '_linha') return;
    const v = obj[k];
    copia[k] = (v instanceof Date) ? isoLocal_(v) : v;
  });
  return copia;
}

function isoLocal_(data) {
  return Utilities.formatDate(data, FUSO, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Aba Config como objeto { chave: valor }. */
function lerConfig_() {
  const config = {};
  listar_(ABAS.CONFIG).forEach(function (c) {
    config[String(c.chave).trim()] = c.valor;
  });
  return config;
}

function numeroConfig_(config, chave) {
  const v = config[chave];
  const n = (typeof v === 'number') ? v : Number(String(v).trim().replace(',', '.'));
  if (v === undefined || v === '' || isNaN(n)) {
    throw new Error('A configuração ' + chave + ' está ausente ou inválida na aba Config.');
  }
  return n;
}

/** Valores de colunas que mudaram: { coluna: valorNovo }. */
function diferencas_(atual, novos) {
  const mudancas = {};
  Object.keys(novos).forEach(function (k) {
    if (valorComparavel_(atual[k]) !== valorComparavel_(novos[k])) mudancas[k] = novos[k];
  });
  return mudancas;
}

function valorComparavel_(v) {
  if (v === undefined || v === null || v === '') return '';
  if (v instanceof Date) return isoLocal_(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  const s = String(v).trim();
  return (s.toUpperCase() === 'TRUE' || s.toUpperCase() === 'FALSE') ? s.toUpperCase() : s;
}

/** Subconjunto das colunas indicadas, pronto para o Log. */
function selecionar_(obj, chaves) {
  const parte = {};
  chaves.forEach(function (k) { parte[k] = obj[k]; });
  return paraCliente_(parte);
}

function ehVerdadeiro_(v) {
  return v === true || String(v).trim().toUpperCase() === 'TRUE';
}

/** Monta uma linha da aba Log (sem gravar). */
function montarLog_(acao, entidade, chave, antes, depois) {
  return {
    timestamp: new Date(),
    email: emailAtual_() || '(não identificado)',
    acao: acao,
    entidade: entidade,
    chave: String(chave),
    antes: antes ? JSON.stringify(paraCliente_(antes)) : '',
    depois: depois ? JSON.stringify(paraCliente_(depois)) : ''
  };
}

function gravarLog_(acao, entidade, chave, antes, depois) {
  incluir_(ABAS.LOG, [montarLog_(acao, entidade, chave, antes, depois)]);
}

/** Executa `fn` com o lock do script, para evitar gravações simultâneas. */
function comLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('O sistema está ocupado com outra gravação. Tente de novo em alguns segundos.');
  }
  try {
    const resultado = fn();
    SpreadsheetApp.flush();
    return resultado;
  } finally {
    lock.releaseLock();
  }
}
