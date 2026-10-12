/**
 * Configuracoes.js – tela "Configurações" (somente SUPERADMIN): parâmetros da aba Config,
 * feriados, vigências e quantidades contratadas, lembrete por e-mail e consulta aos preços.
 * Feriados e vigências são configuração: podem ser excluídos, sempre com registro no Log.
 * Competências e medições continuam sem exclusão.
 */

/** Parâmetros editáveis da aba Config, na ordem da tela. */
const PARAMETROS_CONFIG = [
  { chave: 'CONTRATO', rotulo: 'Número do contrato', tipo: 'texto' },
  { chave: 'EMPRESA', rotulo: 'Empresa contratada', tipo: 'texto' },
  { chave: 'CNPJ', rotulo: 'CNPJ da empresa', tipo: 'cnpj', dica: 'Formato 00.000.000/0000-00' },
  { chave: 'OBJETO_ATESTO', rotulo: 'Objeto (usado no texto do atesto)', tipo: 'textoLongo' },
  { chave: 'VIGENCIA_ATUAL', rotulo: 'Vigência atual', tipo: 'vigencia', dica: 'Usada no painel e no histórico' },
  { chave: 'ANS_LIMITE_MIN', rotulo: 'Limite do ANS (minutos de indisponibilidade no mês)', tipo: 'inteiro' },
  { chave: 'ANS_PERCENTUAL', rotulo: 'ANS – percentual de referência do TR', tipo: 'decimal', dica: 'Só referência; o cumprimento usa o limite em minutos' },
  { chave: 'ALERTA_SALDO', rotulo: 'Alerta de saldo (% consumido na vigência)', tipo: 'percentual' },
  { chave: 'SEI_PAGAMENTO', rotulo: 'Processo SEI de pagamento', tipo: 'processoSei', dica: 'Formato 0000000-00.0000.0.00.0000' },
  { chave: 'UNIDADE_PAGAMENTO', rotulo: 'Unidade que recebe o processo de pagamento', tipo: 'texto', dica: 'Aparece no despacho ("À ...,")' },
  { chave: 'FISCAL_TECNICO_ASSINATURA', rotulo: 'Nome na assinatura do atesto e do despacho', tipo: 'texto' },
  { chave: 'EMAILS_LEMBRETE', rotulo: 'E-mails que recebem o lembrete', tipo: 'emails', dica: 'Somente @' + 'tre-ma.jus.br' }
];

/* ---------- Leitura ---------- */

function getConfiguracoes() {
  requirePerfil_([PERFIS.SUPERADMIN]);
  return montarConfiguracoes_();
}

function montarConfiguracoes_() {
  const linhasConfig = {};
  listar_(ABAS.CONFIG).forEach(function (c) { linhasConfig[String(c.chave).trim()] = c; });
  const vigencias = listarVigenciasConfig_();

  return {
    parametros: PARAMETROS_CONFIG.map(function (p) {
      const linha = linhasConfig[p.chave];
      return {
        chave: p.chave,
        rotulo: p.rotulo,
        tipo: p.tipo,
        dica: p.dica || '',
        descricao: linha ? String(linha.descricao || '') : '',
        valor: valorParametroParaTela_(p, linha ? linha.valor : '')
      };
    }),
    vigencias: vigencias,
    itens: listarItens_(),
    feriados: listar_(ABAS.FERIADOS)
      .map(function (f) { return { data: dataIso_(f.data), descricao: String(f.descricao || '') }; })
      .filter(function (f) { return f.data; })
      .sort(function (a, b) { return a.data < b.data ? -1 : 1; }),
    precos: listar_(ABAS.PRECOS).map(function (p) {
      return { vigencia: String(p.vigencia), item: Number(p.item), valorUnitario: Number(p.valorUnitario), documento: String(p.documento || '') };
    }),
    lembrete: {
      ativo: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === HANDLER_LEMBRETE; }),
      homologacao: ehHomologacao_()
    }
  };
}

function listarVigenciasConfig_() {
  const atual = String(lerConfig_().VIGENCIA_ATUAL || '').trim();
  const uso = {};
  listar_(ABAS.COMPETENCIAS).forEach(function (c) {
    const id = String(c.vigencia).trim();
    uso[id] = (uso[id] || 0) + 1;
  });
  const quantidades = {};
  listar_(ABAS.QTD_CONTRATADAS).forEach(function (q) {
    const id = String(q.vigencia).trim();
    quantidades[id] = quantidades[id] || {};
    quantidades[id][Number(q.item)] = Number(q.qtdContratada);
  });
  const comPrecos = {};
  listar_(ABAS.PRECOS).forEach(function (p) { comPrecos[String(p.vigencia).trim()] = true; });

  return listar_(ABAS.VIGENCIAS)
    .map(function (v) {
      const id = String(v.id).trim();
      return {
        id: id,
        inicio: dataIso_(v.inicio),
        fim: dataIso_(v.fim),
        documento: String(v.documento || ''),
        observacao: String(v.observacao || ''),
        quantidades: quantidades[id] || {},
        competencias: uso[id] || 0,
        atual: id === atual,
        temPrecos: !!comPrecos[id]
      };
    })
    .sort(function (a, b) { return a.inicio < b.inicio ? 1 : -1; });
}

function valorParametroParaTela_(p, valor) {
  if (valor === '' || valor === null || valor === undefined) return p.tipo === 'emails' ? [] : '';
  switch (p.tipo) {
    case 'percentual': return String(Math.round(Number(String(valor).replace(',', '.')) * 10000) / 100).replace('.', ',');
    case 'decimal': return String(valor).replace('.', ',');
    case 'emails': return String(valor).split(/[;,]/).map(normalizarEmail_).filter(String);
    default: return String(valor);
  }
}

/* ---------- Parâmetros ---------- */

function salvarParametro(chave, valor) {
  requirePerfil_([PERFIS.SUPERADMIN]);
  const def = PARAMETROS_CONFIG.find(function (p) { return p.chave === chave; });
  if (!def) throw new Error('Parâmetro desconhecido: ' + chave + '.');
  const novo = validarParametro_(def, valor);
  return comLock_(function () {
    const linha = listar_(ABAS.CONFIG).find(function (c) { return String(c.chave).trim() === chave; });
    if (linha) {
      if (valorComparavel_(linha.valor) === valorComparavel_(novo)) {
        return { mensagem: 'Nenhuma alteração em "' + def.rotulo + '".', configuracoes: montarConfiguracoes_() };
      }
      atualizar_(ABAS.CONFIG, linha._linha, { valor: novo });
      gravarLog_('CONFIG', ABAS.CONFIG, chave, { valor: linha.valor }, { valor: novo });
    } else {
      incluir_(ABAS.CONFIG, [{ chave: chave, valor: novo, descricao: '' }]);
      gravarLog_('CONFIG', ABAS.CONFIG, chave, null, { valor: novo });
    }
    return { mensagem: '"' + def.rotulo + '" salvo.', configuracoes: montarConfiguracoes_() };
  });
}

/** Valida e converte para o valor gravado na planilha. */
function validarParametro_(def, valor) {
  const texto = String(valor === undefined || valor === null ? '' : valor).trim();
  const rotulo = '"' + def.rotulo + '"';
  switch (def.tipo) {
    case 'texto':
      if (!texto) throw new Error('Preencha ' + rotulo + '.');
      if (texto.length > 200) throw new Error(rotulo + ' deve ter no máximo 200 caracteres.');
      return texto;
    case 'textoLongo':
      if (!texto) throw new Error('Preencha ' + rotulo + '.');
      if (texto.length > 1000) throw new Error(rotulo + ' deve ter no máximo 1.000 caracteres.');
      return texto.replace(/\s+/g, ' ');
    case 'cnpj':
      if (!/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(texto)) throw new Error('CNPJ inválido. Use o formato 00.000.000/0000-00.');
      return texto;
    case 'processoSei':
      if (!/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(texto)) {
        throw new Error('Número de processo inválido. Use o formato 0000000-00.0000.0.00.0000.');
      }
      return texto;
    case 'vigencia':
      if (!listar_(ABAS.VIGENCIAS).some(function (v) { return String(v.id).trim() === texto; })) {
        throw new Error('Escolha uma vigência cadastrada.');
      }
      return texto;
    case 'inteiro':
      if (!/^\d+$/.test(texto) || Number(texto) <= 0) throw new Error(rotulo + ' deve ser um número inteiro maior que 0.');
      return Number(texto);
    case 'decimal': {
      const n = lerPercentual_(texto);
      if (n === null || n <= 0) throw new Error(rotulo + ' deve ser um número entre 0 e 100 (ex.: 99,741).');
      return n;
    }
    case 'percentual': {
      const n = lerPercentual_(texto);
      if (n === null || n <= 0) throw new Error(rotulo + ' deve ser um número entre 1 e 100 (ex.: 80).');
      return Math.round(n * 100) / 10000;
    }
    case 'emails': {
      const lista = (Array.isArray(valor) ? valor : String(valor).split(/[;,]/)).map(normalizarEmail_).filter(String);
      const unicos = lista.filter(function (e, i) { return lista.indexOf(e) === i; });
      const formato = new RegExp('^[a-z0-9._%+-]+@' + DOMINIO_PERMITIDO.replace(/\./g, '\\.') + '$');
      const invalidos = unicos.filter(function (e) { return !formato.test(e); });
      if (!unicos.length) throw new Error('Informe pelo menos um e-mail para o lembrete.');
      if (invalidos.length) throw new Error('Só são aceitos e-mails @' + DOMINIO_PERMITIDO + '. Inválidos: ' + invalidos.join(', ') + '.');
      return unicos.join('; ');
    }
  }
  throw new Error('Tipo de parâmetro sem validação: ' + def.tipo + '.');
}

/* ---------- Feriados ---------- */

/** dados: { dataOriginal (vazia para novo), data: 'yyyy-MM-dd', descricao } */
function salvarFeriado(dados) {
  requirePerfil_([PERFIS.SUPERADMIN]);
  const data = validarDataIso_(dados && dados.data, 'Data do feriado');
  const descricao = String((dados && dados.descricao) || '').trim();
  if (!descricao) throw new Error('Informe a descrição do feriado.');
  if (descricao.length > 200) throw new Error('A descrição deve ter no máximo 200 caracteres.');
  const original = String((dados && dados.dataOriginal) || '').trim();

  return comLock_(function () {
    const feriados = listar_(ABAS.FERIADOS);
    const repetido = feriados.find(function (f) { return dataIso_(f.data) === data && dataIso_(f.data) !== original; });
    if (repetido) throw new Error('Já existe feriado em ' + dataBr_(data) + ' (' + repetido.descricao + ').');
    const novo = { data: dataDeIso_(data), descricao: descricao };

    if (original) {
      const atual = feriados.find(function (f) { return dataIso_(f.data) === original; });
      if (!atual) throw new Error('Feriado de ' + dataBr_(original) + ' não encontrado.');
      const mudancas = diferencas_(atual, novo);
      if (!Object.keys(mudancas).length) return resultadoConfig_('Nenhuma alteração no feriado.');
      atualizar_(ABAS.FERIADOS, atual._linha, mudancas);
      gravarLog_('EDITAR', ABAS.FERIADOS, original, selecionar_(atual, Object.keys(mudancas)), mudancas);
      return resultadoConfig_('Feriado de ' + dataBr_(data) + ' atualizado.');
    }
    incluir_(ABAS.FERIADOS, [novo]);
    gravarLog_('CRIAR', ABAS.FERIADOS, data, null, novo);
    return resultadoConfig_('Feriado de ' + dataBr_(data) + ' incluído.');
  });
}

function excluirFeriado(data) {
  requirePerfil_([PERFIS.SUPERADMIN]);
  const dia = validarDataIso_(data, 'Data do feriado');
  return comLock_(function () {
    const atual = listar_(ABAS.FERIADOS).find(function (f) { return dataIso_(f.data) === dia; });
    if (!atual) throw new Error('Feriado de ' + dataBr_(dia) + ' não encontrado.');
    excluirLinhas_(ABAS.FERIADOS, [atual._linha]);
    gravarLog_('EXCLUIR', ABAS.FERIADOS, dia, atual, null);
    return resultadoConfig_('Feriado de ' + dataBr_(dia) + ' excluído.');
  });
}

/* ---------- Vigências e quantidades contratadas ---------- */

/**
 * dados: { novo, id, inicio, fim, documento, observacao, quantidades: { item: valor } }
 * O id não muda depois de criado.
 */
function salvarVigencia(dados) {
  requirePerfil_([PERFIS.SUPERADMIN]);
  if (!dados || typeof dados !== 'object') throw new Error('Dados da vigência não informados.');
  const id = String(dados.id || '').trim();
  if (!/^[A-Za-z0-9_-]{2,20}$/.test(id)) throw new Error('Identificador inválido: use de 2 a 20 letras, números, "-" ou "_" (ex.: V2027).');
  const inicio = validarDataIso_(dados.inicio, 'Início da vigência');
  const fim = validarDataIso_(dados.fim, 'Fim da vigência');
  if (fim <= inicio) throw new Error('O fim da vigência deve ser depois do início.');
  const documento = String(dados.documento || '').trim();
  if (!documento) throw new Error('Informe o documento da vigência (ex.: 3º Termo Aditivo (SEI 0000000)).');
  const observacao = String(dados.observacao || '').trim();

  const itens = listarItens_();
  const erros = [];
  const quantidades = {};
  itens.forEach(function (it) {
    const valor = lerInteiro_((dados.quantidades || {})[it.item], 'Quantidade contratada do item ' + it.item, erros);
    if (valor === null) erros.push('Informe a quantidade contratada do item ' + it.item + ' (0 se não houver).');
    else if (valor !== undefined) quantidades[it.item] = valor;
  });
  if (erros.length) throw new Error(erros.join('\n'));

  return comLock_(function () {
    const vigencias = listar_(ABAS.VIGENCIAS);
    const existente = vigencias.find(function (v) { return String(v.id).trim() === id; });
    if (dados.novo === true && existente) throw new Error('Já existe a vigência ' + id + '.');
    if (dados.novo !== true && !existente) throw new Error('Vigência ' + id + ' não encontrada.');

    const sobreposta = vigencias.find(function (v) {
      return String(v.id).trim() !== id && !(fim < dataIso_(v.inicio) || inicio > dataIso_(v.fim));
    });
    if (sobreposta) {
      throw new Error('O período se sobrepõe à vigência ' + sobreposta.id + ' (' + dataBr_(dataIso_(sobreposta.inicio)) +
        ' a ' + dataBr_(dataIso_(sobreposta.fim)) + ').');
    }
    const foraDoPeriodo = listar_(ABAS.COMPETENCIAS)
      .filter(function (c) { return String(c.vigencia).trim() === id; })
      .map(function (c) { return textoCompetencia_(c.competencia); })
      .filter(function (comp) {
        return comp + '-01' < inicio || comp + '-' + ('0' + diasNoMes_(comp)).slice(-2) > fim;
      });
    if (foraDoPeriodo.length) {
      throw new Error('As competências ' + foraDoPeriodo.map(rotuloCompetencia_).join(', ') +
        ' desta vigência ficariam fora do novo período.');
    }

    const registro = { id: id, inicio: dataDeIso_(inicio), fim: dataDeIso_(fim), documento: documento, observacao: observacao };
    const logs = [];
    if (existente) {
      const mudancas = diferencas_(existente, registro);
      if (Object.keys(mudancas).length) {
        atualizar_(ABAS.VIGENCIAS, existente._linha, mudancas);
        logs.push(montarLog_('EDITAR', ABAS.VIGENCIAS, id, selecionar_(existente, Object.keys(mudancas)), mudancas));
      }
    } else {
      incluir_(ABAS.VIGENCIAS, [registro]);
      logs.push(montarLog_('CRIAR', ABAS.VIGENCIAS, id, null, registro));
    }

    const atuais = listar_(ABAS.QTD_CONTRATADAS).filter(function (q) { return String(q.vigencia).trim() === id; });
    const novas = [];
    itens.forEach(function (it) {
      const chave = id + '/' + it.item;
      const valores = { qtdContratada: quantidades[it.item] };
      const atual = atuais.find(function (q) { return Number(q.item) === it.item; });
      if (!atual) {
        const nova = { vigencia: id, item: it.item, qtdContratada: quantidades[it.item] };
        novas.push(nova);
        logs.push(montarLog_('CRIAR', ABAS.QTD_CONTRATADAS, chave, null, nova));
        return;
      }
      const mudancas = diferencas_(atual, valores);
      if (!Object.keys(mudancas).length) return;
      atualizar_(ABAS.QTD_CONTRATADAS, atual._linha, mudancas);
      logs.push(montarLog_('EDITAR', ABAS.QTD_CONTRATADAS, chave, selecionar_(atual, ['qtdContratada']), mudancas));
    });
    incluir_(ABAS.QTD_CONTRATADAS, novas);
    incluir_(ABAS.LOG, logs);

    if (!logs.length) return resultadoConfig_('Nenhuma alteração na vigência ' + id + '.');
    return resultadoConfig_('Vigência ' + id + (existente ? ' atualizada.' : ' cadastrada.'));
  });
}

/** Exclui vigência sem competências, que não seja a atual e não tenha preços de referência. */
function excluirVigencia(id) {
  requirePerfil_([PERFIS.SUPERADMIN]);
  const alvo = String(id || '').trim();
  return comLock_(function () {
    const vigencia = listar_(ABAS.VIGENCIAS).find(function (v) { return String(v.id).trim() === alvo; });
    if (!vigencia) throw new Error('Vigência ' + alvo + ' não encontrada.');
    if (String(lerConfig_().VIGENCIA_ATUAL || '').trim() === alvo) {
      throw new Error('A vigência ' + alvo + ' é a vigência atual. Escolha outra em Parâmetros antes de excluir.');
    }
    const competencias = listar_(ABAS.COMPETENCIAS).filter(function (c) { return String(c.vigencia).trim() === alvo; });
    if (competencias.length) {
      throw new Error('A vigência ' + alvo + ' tem ' + competencias.length + ' competência(s) lançada(s) e não pode ser excluída.');
    }
    if (listar_(ABAS.PRECOS).some(function (p) { return String(p.vigencia).trim() === alvo; })) {
      throw new Error('A vigência ' + alvo + ' tem preços de referência cadastrados e não pode ser excluída pelo app.');
    }
    const quantidades = listar_(ABAS.QTD_CONTRATADAS).filter(function (q) { return String(q.vigencia).trim() === alvo; });
    const logs = quantidades.map(function (q) {
      return montarLog_('EXCLUIR', ABAS.QTD_CONTRATADAS, alvo + '/' + q.item, q, null);
    });
    logs.push(montarLog_('EXCLUIR', ABAS.VIGENCIAS, alvo, vigencia, null));
    excluirLinhas_(ABAS.QTD_CONTRATADAS, quantidades.map(function (q) { return q._linha; }));
    excluirLinhas_(ABAS.VIGENCIAS, [vigencia._linha]);
    incluir_(ABAS.LOG, logs);
    return resultadoConfig_('Vigência ' + alvo + ' excluída.');
  });
}

/* ---------- Auxiliares ---------- */

function resultadoConfig_(mensagem) {
  return { mensagem: mensagem, configuracoes: montarConfiguracoes_() };
}

function validarDataIso_(valor, rotulo) {
  const texto = String(valor || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto) || isNaN(new Date(texto + 'T00:00:00Z').getTime())) {
    throw new Error('Informe ' + rotulo.toLowerCase() + ' válida.');
  }
  return texto;
}

/** 'yyyy-MM-dd' → Date à meia-noite no fuso do script. */
function dataDeIso_(dia) {
  return new Date(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)));
}
