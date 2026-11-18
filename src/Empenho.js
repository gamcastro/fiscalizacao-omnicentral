/**
 * Empenho.js – módulo de Acompanhamento do Empenho (Fase 7; SPEC 1.3, 3.13 a 3.16, regra 9, tela 8 e texto 6.3).
 *
 * É o ÚNICO arquivo do servidor que calcula ou mostra valores em reais (regra 1 do CLAUDE.md).
 * Lê as quantidades medidas, as vigências e os preços de referência, mas NUNCA grava nas abas
 * da fiscalização técnica. Só grava em Empenhos, EmpenhoMovimentos, Pagamentos, EmpenhoPrevisoes
 * e nas chaves EMPENHO_* da Config, sempre com Log.
 */

const TIPOS_MOVIMENTO = { REFORCO: 'Reforço', ANULACAO: 'Anulação' };
const TIPOS_PAGAMENTO = { MENSAL: 'Mensal', RETROATIVO: 'Retroativo', OUTRO: 'Outro' };
const SITUACOES_PAGAMENTO = { A_PAGAR: 'A pagar', PAGO: 'Pago' };
const SITUACOES_MES_EMPENHO = {
  PAGO: 'Pago',
  A_PAGAR: 'A pagar',
  MEDIDA: 'Medida, sem pagamento',
  FUTURA: 'A medir'
};
const INDICACOES_EMPENHO = { REFORCO: 'Solicitar reforço', ANULACAO: 'Avaliar anulação', ADEQUADO: 'Saldo adequado' };
const MESES_EMPENHO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];

/** Parâmetros do módulo, editáveis só pelo SUPERADMIN dentro da tela do empenho (decisão de 17/11/2026). */
const PARAMETROS_EMPENHO = [
  { chave: 'EMPENHO_EXERCICIO', rotulo: 'Exercício aberto por padrão', tipo: 'ano' },
  { chave: 'EMPENHO_MARGEM', rotulo: 'Margem de segurança da projeção (%)', tipo: 'percentual', dica: 'ex.: 10' },
  { chave: 'EMPENHO_DATA_LIMITE', rotulo: 'Data-limite para pedir reforço ou anulação', tipo: 'data', opcional: true,
    dica: 'Informada pelo setor de orçamento. Vale para o exercício aberto por padrão.' },
  { chave: 'EMPENHO_AVISO_DIAS', rotulo: 'Dias de antecedência do aviso de prazo', tipo: 'inteiro' },
  { chave: 'EMPENHO_TOLERANCIA_NF', rotulo: 'Tolerância NF × valor estimado (R$)', tipo: 'reais', dica: 'ex.: 1,00' },
  { chave: 'EMPENHO_UNIDADE_DESTINO', rotulo: 'Unidade destinatária do despacho de reforço/anulação', tipo: 'texto', opcional: true }
];

/** Perfis do módulo (o SUPERADMIN sempre passa em requirePerfil_). Função, e não constante, por causa da ordem dos arquivos. */
function perfisEmpenho_() {
  return [PERFIS.FISCAL_TECNICO, PERFIS.GESTOR];
}

function temAcessoEmpenho_(perfil) {
  return perfil === PERFIS.SUPERADMIN || perfisEmpenho_().indexOf(perfil) >= 0;
}

/* ====================================================================== */
/* Leitura                                                                 */
/* ====================================================================== */

/** Tela do empenho: cards, mês a mês, cadastros e parâmetros. */
function getEmpenho(exercicio) {
  const usuario = requirePerfil_(perfisEmpenho_());
  exigirAbasEmpenho_();
  return montarEmpenho_(exercicio, usuario);
}

/** Card do painel (só os três perfis do módulo). Nunca lança erro: devolve { indisponivel, texto }. */
function getResumoEmpenho() {
  requirePerfil_(perfisEmpenho_());
  if (!abasEmpenhoExistem_()) {
    return { indisponivel: true, texto: 'O módulo de empenho ainda não foi configurado (o superadmin precisa rodar setup()).' };
  }
  const config = lerConfig_();
  const exercicio = exercicioPadrao_(config);
  const calc = calcularEmpenho_(lerDadosEmpenho_(exercicio, config));
  const prazo = prazoEmpenho_(config, hojeIso_());
  return {
    indisponivel: false,
    exercicio: exercicio,
    semNotas: !calc.nes.length,
    saldo: calc.totais.saldo,
    necessidadeProvavel: calc.necessidade.provavel,
    indicacao: calc.indicacao,
    prazo: prazo
  };
}

function abasEmpenhoExistem_() {
  const ss = planilha_();
  return [ABAS.EMPENHOS, ABAS.EMP_MOVIMENTOS, ABAS.PAGAMENTOS, ABAS.EMP_PREVISOES]
    .every(function (nome) { return !!ss.getSheetByName(nome); });
}

function exigirAbasEmpenho_() {
  if (!abasEmpenhoExistem_()) {
    throw new Error('As abas do módulo de empenho ainda não existem. Peça ao superadmin para rodar setup().');
  }
}

function hojeIso_() {
  return Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
}

function exercicioPadrao_(config) {
  const v = String(config.EMPENHO_EXERCICIO === undefined ? '' : config.EMPENHO_EXERCICIO).trim();
  return /^\d{4}$/.test(v) ? v : hojeIso_().slice(0, 4);
}

/** Lê tudo o que o cálculo precisa, já em objetos simples (datas em 'yyyy-MM-dd'). */
function lerDadosEmpenho_(exercicio, config) {
  const vigencias = listar_(ABAS.VIGENCIAS).map(function (v) {
    return { id: String(v.id).trim(), inicio: dataIso_(v.inicio), fim: dataIso_(v.fim) };
  }).filter(function (v) { return v.inicio && v.fim; });

  const precos = {};
  const documentosPrecos = {};
  listar_(ABAS.PRECOS).forEach(function (p) {
    const vig = String(p.vigencia).trim();
    precos[vig] = precos[vig] || {};
    precos[vig][Number(p.item)] = numeroPlanilha_(p.valorUnitario) || 0;
    if (String(p.documento || '').trim()) documentosPrecos[vig] = String(p.documento).trim();
  });

  const competencias = {};
  listar_(ABAS.COMPETENCIAS).forEach(function (c) {
    competencias[textoCompetencia_(c.competencia)] = { vigencia: String(c.vigencia).trim(), status: String(c.status) };
  });
  const medicoes = {};
  listar_(ABAS.MEDICOES).forEach(function (m) {
    const comp = textoCompetencia_(m.competencia);
    medicoes[comp] = medicoes[comp] || {};
    medicoes[comp][Number(m.item)] = (m.quantidade === '' || m.quantidade === null) ? null : Number(m.quantidade);
  });

  return {
    exercicio: String(exercicio),
    mesAtual: hojeIso_().slice(0, 7),
    margem: numeroConfigOu_(config, 'EMPENHO_MARGEM', 0.1),
    tolerancia: numeroConfigOu_(config, 'EMPENHO_TOLERANCIA_NF', 1),
    itens: listarItens_().map(function (i) { return { item: i.item, tipo: i.tipo, descricao: i.descricao }; }),
    vigencias: vigencias,
    precos: precos,
    documentosPrecos: documentosPrecos,
    competencias: competencias,
    medicoes: medicoes,
    empenhos: lerEmpenhos_(),
    movimentos: lerMovimentos_(),
    pagamentos: lerPagamentos_(),
    previsoes: lerPrevisoes_()
  };
}

function lerEmpenhos_() {
  return listar_(ABAS.EMPENHOS).map(function (e) {
    return {
      id: String(e.id).trim().toUpperCase(),
      exercicio: String(e.exercicio).trim(),
      dataEmissao: dataIso_(e.dataEmissao),
      valorInicial: numeroPlanilha_(e.valorInicial) || 0,
      idSei: String(e.idSei || '').trim(),
      obs: String(e.obs || ''),
      ativo: ehVerdadeiro_(e.ativo),
      _linha: e._linha
    };
  });
}

function lerMovimentos_() {
  return listar_(ABAS.EMP_MOVIMENTOS).map(function (m) {
    return {
      id: String(m.id).trim(),
      empenhoId: String(m.empenhoId).trim().toUpperCase(),
      tipo: String(m.tipo).trim(),
      data: dataIso_(m.data),
      valor: numeroPlanilha_(m.valor) || 0,
      idSei: String(m.idSei || '').trim(),
      obs: String(m.obs || ''),
      ativo: ehVerdadeiro_(m.ativo),
      _linha: m._linha
    };
  });
}

function lerPagamentos_() {
  return listar_(ABAS.PAGAMENTOS).map(function (p) {
    return {
      id: String(p.id).trim(),
      competencia: textoCompetencia_(p.competencia),
      empenhoId: String(p.empenhoId).trim().toUpperCase(),
      tipo: String(p.tipo).trim(),
      numeroNF: String(p.numeroNF || '').trim(),
      dataNF: dataIso_(p.dataNF),
      valorNF: numeroPlanilha_(p.valorNF) || 0,
      situacao: String(p.situacao).trim(),
      valorPago: numeroPlanilha_(p.valorPago),
      dataPagamento: dataIso_(p.dataPagamento),
      idSei: String(p.idSei || '').trim(),
      obs: String(p.obs || ''),
      ativo: ehVerdadeiro_(p.ativo),
      _linha: p._linha
    };
  });
}

function lerPrevisoes_() {
  return listar_(ABAS.EMP_PREVISOES).map(function (p) {
    return {
      ref: p._linha,
      exercicio: String(p.exercicio).trim(),
      competencia: textoCompetencia_(p.competencia),
      item: Number(p.item),
      quantidadePrevista: Number(p.quantidadePrevista) || 0,
      obs: String(p.obs || ''),
      ativo: ehVerdadeiro_(p.ativo),
      _linha: p._linha
    };
  });
}

/** Número gravado na planilha (número, ou texto com vírgula decimal). Vazio → null. */
function numeroPlanilha_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function numeroConfigOu_(config, chave, padrao) {
  const n = numeroPlanilha_(config[chave]);
  return n === null ? padrao : n;
}

/** Data de uma chave da Config: Date, 'yyyy-MM-dd' ou 'dd/mm/aaaa'. Vazio → ''. */
function dataConfig_(v) {
  if (v instanceof Date) return dataIso_(v);
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return br ? br[3] + '-' + br[2] + '-' + br[1] : '';
}

/** Monta tudo o que a tela do empenho mostra. */
function montarEmpenho_(exercicio, usuario) {
  const config = lerConfig_();
  const padrao = exercicioPadrao_(config);
  const ano = /^\d{4}$/.test(String(exercicio || '')) ? String(exercicio) : padrao;
  const dados = lerDadosEmpenho_(ano, config);
  const calc = calcularEmpenho_(dados);

  const nesDoExercicio = dados.empenhos.filter(function (e) { return e.exercicio === ano; });
  const idsDoExercicio = {};
  nesDoExercicio.forEach(function (e) { idsDoExercicio[e.id] = true; });
  const calcPorNe = {};
  calc.nes.forEach(function (n) { calcPorNe[n.id] = n; });

  const empenhos = nesDoExercicio
    .sort(function (a, b) { return a.id < b.id ? -1 : 1; })
    .map(function (e) {
      return Object.assign(semLinha_(e), {
        resumo: calcPorNe[e.id] || null,
        movimentos: dados.movimentos
          .filter(function (m) { return m.empenhoId === e.id; })
          .sort(function (a, b) { return a.data < b.data ? -1 : 1; })
          .map(semLinha_)
      });
    });

  const pagamentos = dados.pagamentos
    .filter(function (p) { return idsDoExercicio[p.empenhoId]; })
    .sort(function (a, b) { return a.competencia < b.competencia ? -1 : a.competencia > b.competencia ? 1 : (a.id < b.id ? -1 : 1); })
    .map(semLinha_);

  const previsoes = dados.previsoes
    .filter(function (p) { return p.exercicio === ano; })
    .sort(function (a, b) { return a.competencia < b.competencia ? -1 : a.competencia > b.competencia ? 1 : a.item - b.item; })
    .map(semLinha_);

  const anos = {};
  anos[padrao] = true;
  anos[hojeIso_().slice(0, 4)] = true;
  anos[ano] = true;
  dados.empenhos.forEach(function (e) { if (/^\d{4}$/.test(e.exercicio)) anos[e.exercicio] = true; });
  dados.vigencias.forEach(function (v) {
    for (let a = Number(v.inicio.slice(0, 4)); a <= Number(v.fim.slice(0, 4)); a++) anos[String(a)] = true;
  });

  const superadmin = usuario.perfil === PERFIS.SUPERADMIN;
  return {
    exercicio: ano,
    exercicioPadrao: padrao,
    exercicios: Object.keys(anos).sort().reverse(),
    calc: calc,
    prazo: ano === padrao ? prazoEmpenho_(config, hojeIso_()) : null,
    empenhos: empenhos,
    pagamentos: pagamentos,
    previsoes: previsoes,
    itens: dados.itens,
    mesesExercicio: calc.meses.map(function (m) { return m.competencia; }),
    unidadeDestino: String(config.EMPENHO_UNIDADE_DESTINO || '').trim(),
    podeConfigurar: superadmin,
    parametros: superadmin ? PARAMETROS_EMPENHO.map(function (p) {
      return { chave: p.chave, rotulo: p.rotulo, tipo: p.tipo, dica: p.dica || '', valor: valorParametroEmpenhoTela_(p, config[p.chave]) };
    }) : []
  };
}

function semLinha_(obj) {
  const copia = {};
  Object.keys(obj).forEach(function (k) { if (k !== '_linha') copia[k] = obj[k]; });
  return copia;
}

/* ====================================================================== */
/* Cálculo (regra 9 da seção 4) – sem dependência do Apps Script; testável */
/* ====================================================================== */

function arred2_(n) {
  return Math.round((Number(n) || 0) * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100;
}

function somaCampo_(lista, campo) {
  return arred2_(lista.reduce(function (s, o) { return s + (Number(o[campo]) || 0); }, 0));
}

function mediana_(valores) {
  const v = valores.slice().sort(function (a, b) { return a - b; });
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

function ultimoDiaDoMes_(comp) {
  const dias = new Date(Date.UTC(Number(comp.slice(0, 4)), Number(comp.slice(5)), 0)).getUTCDate();
  return comp + '-' + ('0' + dias).slice(-2);
}

/** Vigência que cobre o mês inteiro (mesma regra de vigenciaDaCompetencia_). */
function vigenciaDoMes_(comp, vigencias) {
  const inicio = comp + '-01';
  const fim = ultimoDiaDoMes_(comp);
  return vigencias.find(function (v) { return v.inicio <= inicio && v.fim >= fim; }) || null;
}

/** Valor do mês = soma, por item, de quantidade × preço, arredondado a 2 casas por item. */
function valorDoMes_(quantidades, precosVig, itens) {
  return arred2_(itens.reduce(function (s, it) {
    const q = quantidades[it.item];
    if (q === null || q === undefined || !q) return s;
    return s + arred2_(q * (precosVig[it.item] || 0));
  }, 0));
}

/**
 * d: { exercicio, mesAtual, margem, tolerancia, itens, vigencias, precos, documentosPrecos,
 *      competencias, medicoes, empenhos, movimentos, pagamentos, previsoes }
 */
function calcularEmpenho_(d) {
  const ano = String(d.exercicio);
  const margem = Number(d.margem) || 0;
  const avisos = [];

  // 1. Notas de empenho ativas do exercício, reforços, anulações e pagamentos ligados a elas
  const nes = d.empenhos.filter(function (e) { return e.ativo && e.exercicio === ano; });
  const daNe = {};
  nes.forEach(function (e) { daNe[e.id] = true; });
  const movimentos = d.movimentos.filter(function (m) { return m.ativo && daNe[m.empenhoId]; });
  const pagamentos = d.pagamentos.filter(function (p) { return p.ativo && daNe[p.empenhoId]; });
  if (!nes.length) avisos.push('Nenhuma nota de empenho ativa cadastrada para ' + ano + '.');

  const resumoNes = nes.map(function (e) {
    const movs = movimentos.filter(function (m) { return m.empenhoId === e.id; });
    const pags = pagamentos.filter(function (p) { return p.empenhoId === e.id; });
    const reforcos = somaCampo_(movs.filter(function (m) { return m.tipo === 'REFORCO'; }), 'valor');
    const anulacoes = somaCampo_(movs.filter(function (m) { return m.tipo === 'ANULACAO'; }), 'valor');
    const liquido = arred2_(e.valorInicial + reforcos - anulacoes);
    const pago = somaCampo_(pags.filter(function (p) { return p.situacao === 'PAGO'; }), 'valorPago');
    const aPagar = somaCampo_(pags.filter(function (p) { return p.situacao === 'A_PAGAR'; }), 'valorNF');
    const saldo = arred2_(liquido - pago - aPagar);
    if (liquido < 0) {
      avisos.push('A NE ' + e.id + ' ficou com valor líquido negativo (' + formatarReais_(liquido) + '): as anulações passam do valor empenhado.');
    } else if (saldo < 0) {
      avisos.push('A NE ' + e.id + ' tem ' + formatarReais_(-saldo) + ' a mais em pagamentos e valores a pagar do que o valor empenhado líquido.');
    }
    return {
      id: e.id, valorInicial: arred2_(e.valorInicial), reforcos: reforcos, anulacoes: anulacoes,
      liquido: liquido, pago: pago, aPagar: aPagar, saldo: saldo
    };
  });

  // 2. Estatística das quantidades medidas por vigência (itens de consumo)
  const itensConsumo = d.itens.filter(function (it) { return it.tipo === 'CONSUMO'; });
  const estatisticas = {};
  const avisoBase = {};
  function medidasDaVigencia(vigId) {
    const porItem = {};
    let meses = 0;
    Object.keys(d.competencias).forEach(function (comp) {
      if (d.competencias[comp].vigencia !== vigId) return;
      meses++;
      const q = d.medicoes[comp] || {};
      itensConsumo.forEach(function (it) {
        if (q[it.item] === null || q[it.item] === undefined) return;
        (porItem[it.item] = porItem[it.item] || []).push(q[it.item]);
      });
    });
    return meses ? porItem : null;
  }
  function estatisticaDaVigencia(vigId) {
    if (estatisticas[vigId]) return estatisticas[vigId];
    let porItem = medidasDaVigencia(vigId);
    if (!porItem) {
      const atual = d.vigencias.find(function (v) { return v.id === vigId; });
      const anteriores = d.vigencias
        .filter(function (v) { return atual && v.fim < atual.inicio; })
        .sort(function (a, b) { return a.inicio < b.inicio ? 1 : -1; });
      const base = anteriores.find(function (v) { return medidasDaVigencia(v.id); });
      if (base) {
        porItem = medidasDaVigencia(base.id);
        avisoBase[vigId] = 'A vigência ' + vigId + ' ainda não tem meses medidos: mínimo, provável e máximo usam as medições da vigência ' +
          base.id + ' (base da vigência anterior).';
      } else {
        porItem = {};
        avisoBase[vigId] = 'Não há meses medidos para projetar os itens de consumo da vigência ' + vigId + ': eles entram com zero na projeção.';
      }
    }
    const est = {};
    itensConsumo.forEach(function (it) {
      const v = porItem[it.item] || [];
      est[it.item] = v.length
        ? { minimo: Math.min.apply(null, v), provavel: mediana_(v), maximo: Math.max.apply(null, v), meses: v.length }
        : { minimo: 0, provavel: 0, maximo: 0, meses: 0 };
    });
    estatisticas[vigId] = est;
    return est;
  }

  // 3. Previsões manuais ativas do exercício
  const previsoes = {};
  d.previsoes.forEach(function (p) {
    if (p.ativo && p.exercicio === ano) previsoes[p.competencia + '/' + p.item] = p;
  });
  const previsoesUsadas = {};

  // 4. Mês a mês
  const todosMensais = d.pagamentos.filter(function (p) { return p.ativo && p.tipo === 'MENSAL'; });
  const meses = [];
  const semPreco = {};
  for (let m = 1; m <= 12; m++) {
    const comp = ano + '-' + ('0' + m).slice(-2);
    const vig = vigenciaDoMes_(comp, d.vigencias);
    if (!vig) continue;
    const precosVig = d.precos[vig.id] || {};
    d.itens.forEach(function (it) {
      if (!(it.item in precosVig)) semPreco[vig.id + ': item ' + it.item] = true;
    });

    const lancada = !!d.competencias[comp];
    const quantidades = lancada ? (d.medicoes[comp] || {}) : {};
    const doMes = pagamentos.filter(function (p) { return p.competencia === comp; });
    const mensais = doMes.filter(function (p) { return p.tipo === 'MENSAL'; });
    const mensaisOutroExercicio = todosMensais.filter(function (p) { return p.competencia === comp && !daNe[p.empenhoId]; });
    const temMensal = mensais.length > 0 || mensaisOutroExercicio.length > 0;

    let situacao;
    if (temMensal) {
      situacao = mensais.concat(mensaisOutroExercicio).every(function (p) { return p.situacao === 'PAGO'; }) ? 'PAGO' : 'A_PAGAR';
    } else {
      situacao = lancada ? 'MEDIDA' : 'FUTURA';
    }

    const linha = {
      competencia: comp,
      vigencia: vig.id,
      situacao: situacao,
      situacaoRotulo: SITUACOES_MES_EMPENHO[situacao],
      lancada: lancada,
      status: lancada ? d.competencias[comp].status : '',
      semDados: situacao === 'FUTURA' && comp < d.mesAtual,
      quantidades: lancada ? { 2: valorOuNulo_(quantidades[2]), 4: valorOuNulo_(quantidades[4]), 5: valorOuNulo_(quantidades[5]) } : null,
      estimado: lancada ? valorDoMes_(quantidades, precosVig, d.itens) : null,
      previsto: null,
      valorNF: doMes.length ? somaCampo_(doMes, 'valorNF') : null,
      valorPago: doMes.some(function (p) { return p.situacao === 'PAGO'; })
        ? somaCampo_(doMes.filter(function (p) { return p.situacao === 'PAGO'; }), 'valorPago') : null,
      nes: doMes.map(function (p) { return p.empenhoId; })
        .concat(mensaisOutroExercicio.map(function (p) { return p.empenhoId + ' (outro exercício)'; }))
        .filter(function (v, i, a) { return a.indexOf(v) === i; }),
      diferencaNF: null,
      alertaNF: false,
      previsoes: []
    };

    // Conferência da NF (só pagamentos MENSAIS): diferença acima da tolerância gera alerta, sem bloquear.
    if (lancada && mensais.length) {
      linha.diferencaNF = arred2_(somaCampo_(mensais, 'valorNF') - linha.estimado);
      if (Math.abs(linha.diferencaNF) > (Number(d.tolerancia) || 0)) {
        linha.alertaNF = true;
        avisos.push('Competência ' + rotuloMesEmpenho_(comp) + ': a NF mensal (' + formatarReais_(somaCampo_(mensais, 'valorNF')) +
          ') difere do valor estimado (' + formatarReais_(linha.estimado) + ') em ' + formatarReais_(linha.diferencaNF) + '.');
      }
    }

    // Projeção dos meses ainda sem medição
    if (situacao === 'FUTURA') {
      const est = estatisticaDaVigencia(vig.id);
      const cenarios = { minimo: 0, provavel: 0, maximo: 0 };
      d.itens.forEach(function (it) {
        const prev = previsoes[comp + '/' + it.item];
        let q;
        if (prev) {
          q = { minimo: prev.quantidadePrevista, provavel: prev.quantidadePrevista, maximo: prev.quantidadePrevista };
          previsoesUsadas[comp + '/' + it.item] = true;
          linha.previsoes.push({ item: it.item, quantidade: prev.quantidadePrevista, obs: prev.obs });
        } else if (it.tipo === 'FIXO') {
          q = { minimo: 1, provavel: 1, maximo: 1 };
        } else if (it.tipo === 'CONSUMO') {
          q = est[it.item] || { minimo: 0, provavel: 0, maximo: 0 };
        } else {
          return; // itens eventuais (6 a 9) só entram por previsão manual
        }
        const preco = precosVig[it.item] || 0;
        Object.keys(cenarios).forEach(function (c) { cenarios[c] += arred2_(q[c] * preco); });
      });
      Object.keys(cenarios).forEach(function (c) { cenarios[c] = arred2_(cenarios[c]); });
      linha.previsto = cenarios;
      if (avisoBase[vig.id] && avisos.indexOf(avisoBase[vig.id]) < 0) avisos.push(avisoBase[vig.id]);
      if (linha.semDados) {
        avisos.push('Competência ' + rotuloMesEmpenho_(comp) + ': sem dados (sem medição e sem pagamento). Entra na projeção como mês futuro.');
      }
    }
    meses.push(linha);
  }

  Object.keys(previsoes).forEach(function (chave) {
    if (previsoesUsadas[chave]) return;
    const p = previsoes[chave];
    avisos.push('A previsão do item ' + p.item + ' em ' + rotuloMesEmpenho_(p.competencia) +
      ' não entra na projeção: o mês já foi medido ou faturado, ou está fora das vigências.');
  });
  Object.keys(semPreco).forEach(function (k) { avisos.push('Sem preço de referência cadastrado (' + k + '): o item entra com valor zero.'); });

  // 5. Totais
  const empenhado = somaCampo_(resumoNes, 'liquido');
  const pago = somaCampo_(resumoNes, 'pago');
  const aPagar = somaCampo_(resumoNes, 'aPagar');
  const comprometido = somaCampo_(meses.filter(function (m) { return m.situacao === 'MEDIDA'; }), 'estimado');
  const saldo = arred2_(empenhado - pago - aPagar - comprometido);
  const futuras = meses.filter(function (m) { return m.situacao === 'FUTURA'; });
  const necessidade = {
    minimo: arred2_(futuras.reduce(function (s, m) { return s + m.previsto.minimo; }, 0)),
    provavel: arred2_(futuras.reduce(function (s, m) { return s + m.previsto.provavel; }, 0)),
    maximo: arred2_(futuras.reduce(function (s, m) { return s + m.previsto.maximo; }, 0))
  };
  const resultado = {
    minimo: arred2_(saldo - necessidade.minimo),
    provavel: arred2_(saldo - necessidade.provavel),
    maximo: arred2_(saldo - necessidade.maximo)
  };

  // 6. Indicação
  const alvoReforco = arred2_(necessidade.provavel * (1 + margem));
  const alvoAnulacao = arred2_(necessidade.maximo * (1 + margem));
  let indicacao = { tipo: 'ADEQUADO', valor: 0 };
  if (saldo < alvoReforco) {
    indicacao = { tipo: 'REFORCO', valor: Math.ceil(arred2_(alvoReforco - saldo) / 100) * 100 };
  } else if (saldo > alvoAnulacao) {
    const valor = Math.floor(arred2_(saldo - alvoAnulacao) / 100) * 100;
    if (valor > 0) indicacao = { tipo: 'ANULACAO', valor: valor };
  }
  indicacao.rotulo = INDICACOES_EMPENHO[indicacao.tipo];
  indicacao.texto = indicacao.tipo === 'ADEQUADO' ? indicacao.rotulo : indicacao.rotulo + ' de ' + formatarReais_(indicacao.valor);

  const totais = {
    inicial: somaCampo_(resumoNes, 'valorInicial'),
    reforcos: somaCampo_(resumoNes, 'reforcos'),
    anulacoes: somaCampo_(resumoNes, 'anulacoes'),
    empenhado: empenhado,
    pago: pago,
    aPagar: aPagar,
    comprometido: comprometido,
    saldo: saldo
  };

  const documentos = meses.map(function (m) { return d.documentosPrecos[m.vigencia]; })
    .filter(function (v, i, a) { return v && a.indexOf(v) === i; });

  return {
    exercicio: ano,
    margem: margem,
    tolerancia: Number(d.tolerancia) || 0,
    nes: resumoNes,
    totais: totais,
    necessidade: necessidade,
    resultado: resultado,
    alvos: { reforco: alvoReforco, anulacao: alvoAnulacao },
    indicacao: indicacao,
    meses: meses,
    mesesFuturos: futuras.map(function (m) { return m.competencia; }),
    estatisticas: estatisticas,
    documentosPrecos: documentos,
    avisos: avisos
  };
}

function valorOuNulo_(v) {
  return v === null || v === undefined ? null : v;
}

/**
 * Situação do prazo do setor de orçamento (vale para o exercício padrão).
 * situacao: SEM_DATA | ANTES | JANELA | ENCERRADO.
 */
function prazoEmpenho_(config, hoje) {
  const limite = dataConfig_(config.EMPENHO_DATA_LIMITE);
  const avisoDias = Math.max(0, Math.round(numeroConfigOu_(config, 'EMPENHO_AVISO_DIAS', 15)));
  if (!limite) {
    return { situacao: 'SEM_DATA', dataLimite: '', avisoDias: avisoDias, texto: 'Data-limite para reforço ou anulação ainda não informada.' };
  }
  const dias = Math.round((Date.parse(limite + 'T00:00:00Z') - Date.parse(hoje + 'T00:00:00Z')) / 86400000);
  const inicioJanela = somarDias_(limite, -avisoDias);
  let situacao = 'ANTES';
  let texto = 'Prazo para reforço ou anulação: ' + dataBr_(limite) + ' (faltam ' + dias + ' dias).';
  if (dias < 0) {
    situacao = 'ENCERRADO';
    texto = 'O prazo para reforço ou anulação terminou em ' + dataBr_(limite) + '.';
  } else if (hoje >= inicioJanela) {
    situacao = 'JANELA';
    texto = dias === 0
      ? 'Hoje é o último dia para pedir reforço ou anulação (' + dataBr_(limite) + ').'
      : 'Atenção: faltam ' + dias + (dias === 1 ? ' dia' : ' dias') + ' para o prazo de reforço ou anulação (' + dataBr_(limite) + ').';
  }
  return { situacao: situacao, dataLimite: limite, avisoDias: avisoDias, inicioJanela: inicioJanela, diasRestantes: dias, texto: texto };
}

/**
 * Marcos do aviso por e-mail já alcançados hoje (decisão de 17/11/2026):
 * entrada na janela, 3 dias úteis antes da data-limite e o próprio dia (ou o último dia útil antes dele).
 */
function marcosAvisoEmpenho_(prazo, hoje, feriados) {
  if (!prazo.dataLimite || hoje > prazo.dataLimite) return [];
  let diaLimite = prazo.dataLimite;
  while (!ehDiaUtil_(diaLimite, feriados)) diaLimite = somarDias_(diaLimite, -1);
  let tres = diaLimite;
  for (let n = 0; n < 3;) {
    tres = somarDias_(tres, -1);
    if (ehDiaUtil_(tres, feriados)) n++;
  }
  return [
    { marco: 'janela', data: prazo.inicioJanela },
    { marco: '3du', data: tres },
    { marco: 'dia', data: diaLimite }
  ]
    .filter(function (m) { return hoje >= m.data; })
    .sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; })
    .map(function (m) { return m.marco; });
}

/* ---------- Formatação ---------- */

/** R$ 1.234,56 (negativo com sinal de menos). */
function formatarReais_(n) {
  return (n < 0 ? '−' : '') + 'R$ ' + numeroReais_(Math.abs(n));
}

/** 1.234,56 (sem o "R$"). */
function numeroReais_(n) {
  const partes = arred2_(n).toFixed(2).split('.');
  return partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + partes[1];
}

function rotuloMesEmpenho_(comp) {
  return comp.slice(5) + '/' + comp.slice(0, 4);
}

/** "julho, novembro e dezembro de 2026" */
function listaMesesPorExtenso_(comps) {
  if (!comps.length) return '';
  const porAno = {};
  comps.forEach(function (c) { (porAno[c.slice(0, 4)] = porAno[c.slice(0, 4)] || []).push(MESES_EMPENHO[Number(c.slice(5)) - 1]); });
  return juntarComE_(Object.keys(porAno).sort().map(function (a) { return juntarComE_(porAno[a]) + ' de ' + a; }));
}

function juntarComE_(lista) {
  return lista.length <= 1 ? lista.join('') : lista.slice(0, -1).join(', ') + ' e ' + lista[lista.length - 1];
}

function percentualTexto_(fracao) {
  return String(Math.round(fracao * 10000) / 100).replace('.', ',');
}

/* ====================================================================== */
/* Texto 6.3 – despacho de reforço ou anulação                             */
/* ====================================================================== */

/** opcoes: { tipo: 'REFORCO' | 'ANULACAO', empenhoId, valor } → { texto, html, avisos } */
function gerarDespachoEmpenho(exercicio, opcoes) {
  const usuario = requirePerfil_(perfisEmpenho_());
  exigirAbasEmpenho_();
  const config = lerConfig_();
  const ano = /^\d{4}$/.test(String(exercicio || '')) ? String(exercicio) : exercicioPadrao_(config);
  const calc = calcularEmpenho_(lerDadosEmpenho_(ano, config));
  opcoes = opcoes || {};
  const tipo = String(opcoes.tipo || '').trim();
  if (!TIPOS_MOVIMENTO[tipo]) throw new Error('Escolha se o despacho é de reforço ou de anulação.');
  const ne = String(opcoes.empenhoId || '').trim().toUpperCase();
  if (!calc.nes.some(function (n) { return n.id === ne; })) throw new Error('Escolha uma nota de empenho ativa do exercício ' + ano + '.');
  const valor = lerValorReais_(opcoes.valor, 'Valor do ' + (tipo === 'REFORCO' ? 'reforço' : 'anulação'), true, false);
  return montarDespachoEmpenho_(calc, { tipo: tipo, empenhoId: ne, valor: valor }, config, usuario);
}

function montarDespachoEmpenho_(calc, opcoes, config, usuario) {
  const avisos = [];
  const contrato = String(config.CONTRATO || '20/2025');
  let unidade = String(config.EMPENHO_UNIDADE_DESTINO || '').trim();
  if (!unidade) {
    unidade = '[unidade destinatária]';
    avisos.push('A unidade destinatária ainda não foi informada (parâmetro EMPENHO_UNIDADE_DESTINO): o texto mostra um marcador no lugar.');
  }
  const listaNes = juntarComE_(calc.nes.map(function (n) { return n.id; }));
  const meses = listaMesesPorExtenso_(calc.mesesFuturos);
  const documentos = juntarComE_(calc.documentosPrecos) || '[documento dos preços]';
  if (!calc.documentosPrecos.length) avisos.push('Os preços de referência estão sem o documento de origem.');
  if (opcoes.tipo === 'REFORCO' && calc.indicacao.tipo !== 'REFORCO') avisos.push('A indicação atual não é de reforço (' + calc.indicacao.texto + ').');
  if (opcoes.tipo === 'ANULACAO' && calc.indicacao.tipo !== 'ANULACAO') avisos.push('A indicação atual não é de anulação (' + calc.indicacao.texto + ').');

  const funcao = usuario.perfil === PERFIS.GESTOR ? 'Gestor' : 'Fiscal Técnico';
  const nome = String(usuario.nome || '').trim();

  const abertura = 'À ' + unidade + ',';
  const introducao = 'Em acompanhamento da execução orçamentária do Contrato nº ' + contrato +
    ' (OMNICENTRAL), informo a situação das Notas de Empenho do exercício de ' + calc.exercicio + ' (' + listaNes + '):';
  const marcadores = [
    'Valor empenhado: R$ ' + numeroReais_(calc.totais.empenhado) + '.',
    'Valor pago: R$ ' + numeroReais_(calc.totais.pago) + '.',
    'Valor a pagar e comprometido com competências já medidas: R$ ' + numeroReais_(arred2_(calc.totais.aPagar + calc.totais.comprometido)) + '.',
    meses
      ? 'Estimativa para as competências de ' + meses + ': R$ ' + numeroReais_(calc.necessidade.provavel) +
        ' (mínimo de R$ ' + numeroReais_(calc.necessidade.minimo) + ' e máximo de R$ ' + numeroReais_(calc.necessidade.maximo) + ').'
      : 'Não há competências do exercício a medir.'
  ];
  const pedido = opcoes.tipo === 'REFORCO'
    ? 'Diante disso, solicito o reforço de R$ ' + numeroReais_(opcoes.valor) + ' na Nota de Empenho ' + opcoes.empenhoId +
      ', para garantir o pagamento das competências até dezembro de ' + calc.exercicio + '.'
    : 'Diante disso, informo que há saldo estimado excedente e sugiro a anulação de R$ ' + numeroReais_(opcoes.valor) +
      ' da Nota de Empenho ' + opcoes.empenhoId + '.';
  const base = 'A estimativa considera as quantidades medidas pela fiscalização e os preços unitários vigentes (' + documentos +
    '), com margem de segurança de ' + percentualTexto_(calc.margem) + '%.';
  const rodape = funcao + ' do Contrato ' + contrato;

  const texto = [abertura, introducao]
    .concat(marcadores.map(function (m) { return '• ' + m; }))
    .concat([pedido, base, nome, rodape])
    .join('\n');
  const html =
    paragrafoSei_('Texto_Alinhado_Esquerda', 'left', escaparHtml_(abertura)) +
    paragrafoSei_('Texto_Justificado_Recuo_Primeira_Linha', 'justify', escaparHtml_(introducao)) +
    '<ul>' + marcadores.map(function (m) {
      return '<li>' + paragrafoSei_('Texto_Justificado', 'justify', escaparHtml_(m)) + '</li>';
    }).join('') + '</ul>' +
    paragrafoSei_('Texto_Justificado_Recuo_Primeira_Linha', 'justify', escaparHtml_(pedido)) +
    paragrafoSei_('Texto_Justificado_Recuo_Primeira_Linha', 'justify', escaparHtml_(base)) +
    paragrafoSei_('Texto_Centralizado', 'center', escaparHtml_(nome) + '<br>' + escaparHtml_(rodape));
  return { texto: texto, html: html, avisos: avisos };
}

/* ====================================================================== */
/* Gravação (sempre com LockService e Log; nada é apagado)                 */
/* ====================================================================== */

/** dados: { idOriginal (vazio = nova), id, dataEmissao, valorInicial, idSei, obs } */
function salvarEmpenho(dados) {
  const usuario = requirePerfil_(perfisEmpenho_());
  exigirAbasEmpenho_();
  dados = dados || {};
  const editando = String(dados.idOriginal || '').trim().toUpperCase();
  const id = editando || String(dados.id || '').trim().toUpperCase().replace(/\s/g, '');
  if (!/^\d{4}NE\d{6}$/.test(id)) throw new Error('Número da NE inválido. Use o formato 2026NE000333.');
  const exercicio = id.slice(0, 4);
  const dataEmissao = lerDataEmpenho_(dados.dataEmissao, 'Data de emissão', true);
  if (dataEmissao.slice(0, 4) !== exercicio) {
    throw new Error('A data de emissão deve ser de ' + exercicio + ', o ano do número da NE.');
  }
  const novo = {
    exercicio: exercicio,
    dataEmissao: dataDeIso_(dataEmissao),
    valorInicial: lerValorReais_(dados.valorInicial, 'Valor inicial', true, false),
    idSei: lerIdSeiEmpenho_(dados.idSei),
    obs: textoLivre_(dados.obs, 500)
  };

  return comLock_(function () {
    const atual = lerEmpenhos_().find(function (e) { return e.id === id; });
    const agora = new Date();
    if (editando) {
      if (!atual) throw new Error('NE ' + id + ' não encontrada.');
      const linha = listar_(ABAS.EMPENHOS).find(function (l) { return l._linha === atual._linha; });
      const mudancas = diferencas_(linha, novo);
      if (!Object.keys(mudancas).length) return resultadoEmpenho_('Nenhuma alteração na NE ' + id + '.', exercicio, [id]);
      const antes = selecionar_(linha, Object.keys(mudancas));
      mudancas.atualizadoEm = agora;
      mudancas.atualizadoPor = usuario.email;
      atualizar_(ABAS.EMPENHOS, linha._linha, mudancas);
      gravarLog_('EDITAR', ABAS.EMPENHOS, id, antes, mudancas);
      return resultadoEmpenho_('NE ' + id + ' atualizada.', exercicio, [id]);
    }
    if (atual) {
      throw new Error('A NE ' + id + ' já está cadastrada' + (atual.ativo ? '.' : ' (desativada). Reative-a na lista em vez de lançar de novo.'));
    }
    const registro = Object.assign({ id: id }, novo, {
      ativo: true, criadoEm: agora, criadoPor: usuario.email, atualizadoEm: agora, atualizadoPor: usuario.email
    });
    incluir_(ABAS.EMPENHOS, [registro]);
    gravarLog_('CRIAR', ABAS.EMPENHOS, id, null, registro);
    return resultadoEmpenho_('NE ' + id + ' incluída.', exercicio, [id]);
  });
}

/** dados: { id (vazio = novo), empenhoId, tipo, data, valor, idSei, obs } */
function salvarMovimento(dados) {
  const usuario = requirePerfil_(perfisEmpenho_());
  exigirAbasEmpenho_();
  dados = dados || {};
  const tipo = String(dados.tipo || '').trim();
  if (!TIPOS_MOVIMENTO[tipo]) throw new Error('Escolha o tipo do movimento: reforço ou anulação.');
  const empenhoId = String(dados.empenhoId || '').trim().toUpperCase();
  const novo = {
    empenhoId: empenhoId,
    tipo: tipo,
    data: dataDeIso_(lerDataEmpenho_(dados.data, 'Data do ' + TIPOS_MOVIMENTO[tipo].toLowerCase(), true)),
    valor: lerValorReais_(dados.valor, 'Valor', true, false),
    idSei: lerIdSeiEmpenho_(dados.idSei),
    obs: textoLivre_(dados.obs, 500)
  };

  return comLock_(function () {
    const ne = neAtivaOuErro_(empenhoId);
    return gravarRegistroComId_(ABAS.EMP_MOVIMENTOS, 'MOV', String(dados.id || '').trim(), novo, usuario,
      function (id, criado) { return (criado ? TIPOS_MOVIMENTO[tipo] + ' ' + id + ' incluído' : 'Movimento ' + id + ' atualizado') + ' na NE ' + ne.id + '.'; },
      ne.exercicio, [ne.id]);
  });
}

/* ---------- Importação da NE pelo PDF do SIAFI (decisões de 18/11/2026) ---------- */

/**
 * Lê o PDF da NE (impressão completa do SIAFI) enviado pelo navegador e devolve a PRÉVIA da
 * importação. Nada é gravado e o PDF não é guardado (o texto sai de um Google Docs temporário).
 * Retorno: { ok, erro?, arquivo, id, exercicio, dataEmissao, valorInicial, valorTotal,
 *            situacao: NOVA|EXISTENTE, movimentos: [{tipo, data, valor, status}], novos, avisos, texto }
 */
function lerPdfNe(nome, base64) {
  requirePerfil_(perfisEmpenho_());
  exigirAbasEmpenho_();
  const arquivo = String(nome || 'nota_de_empenho.pdf').slice(0, 200);
  const texto = textoDePdfEnviado_(arquivo, base64);
  let lido;
  try {
    lido = interpretarTextoNe_(texto, arquivo, String(lerConfig_().CNPJ || ''));
  } catch (e) {
    return { ok: false, erro: e.message, arquivo: arquivo, texto: texto };
  }
  const ne = lerEmpenhos_().find(function (e) { return e.id === lido.id; });
  if (ne && !ne.ativo) {
    return { ok: false, erro: 'A NE ' + lido.id + ' está cadastrada, mas desativada. Reative-a na lista antes de importar.', arquivo: arquivo, texto: texto };
  }
  const comparacao = compararNeImportada_(lido, ne || null,
    lerMovimentos_().filter(function (m) { return m.ativo && m.empenhoId === lido.id; }));
  return Object.assign({ ok: true, arquivo: arquivo, texto: texto }, lido, {
    situacao: comparacao.situacao,
    movimentos: comparacao.movimentos,
    novos: (comparacao.situacao === 'NOVA' ? 1 : 0) +
      comparacao.movimentos.filter(function (m) { return m.status === 'NOVO'; }).length,
    avisos: lido.avisos.concat(comparacao.avisos)
  });
}

/**
 * Grava a importação confirmada na prévia: cria a NE (se nova) e só os reforços/anulações que
 * ainda não existem. Divergências só geram aviso (nada já cadastrado é alterado).
 * dados: { id, dataEmissao, valorInicial, valorTotal, idSei, arquivo, movimentos: [{tipo, data, valor, idSei}] }
 */
function importarNe(dados) {
  const usuario = requirePerfil_(perfisEmpenho_());
  exigirAbasEmpenho_();
  dados = dados || {};
  const id = String(dados.id || '').trim().toUpperCase();
  if (!/^\d{4}NE\d{6}$/.test(id)) throw new Error('Número da NE inválido. Leia o PDF de novo.');
  const exercicio = id.slice(0, 4);
  const dataEmissao = lerDataEmpenho_(dados.dataEmissao, 'Data de emissão', true);
  if (dataEmissao.slice(0, 4) !== exercicio) throw new Error('A data de emissão deve ser de ' + exercicio + ', o ano do número da NE.');
  const lido = {
    id: id,
    dataEmissao: dataEmissao,
    valorInicial: lerValorReais_(dados.valorInicial, 'Valor inicial', true, false),
    movimentos: (dados.movimentos || []).map(function (m) {
      const tipo = String(m.tipo || '').trim();
      if (!TIPOS_MOVIMENTO[tipo]) throw new Error('Tipo de movimento inválido na importação.');
      return {
        tipo: tipo,
        data: lerDataEmpenho_(m.data, 'Data do ' + TIPOS_MOVIMENTO[tipo].toLowerCase(), true),
        valor: lerValorReais_(m.valor, 'Valor do ' + TIPOS_MOVIMENTO[tipo].toLowerCase(), true, false),
        idSei: lerIdSeiEmpenho_(m.idSei)
      };
    })
  };
  const arquivo = textoLivre_(dados.arquivo, 200);
  const obs = textoLivre_('Importado do PDF do SIAFI' + (arquivo ? ' (' + arquivo + ')' : '') + '.', 500);
  const idSeiNe = lerIdSeiEmpenho_(dados.idSei);

  return comLock_(function () {
    const agora = new Date();
    const carimbo = { ativo: true, criadoEm: agora, criadoPor: usuario.email, atualizadoEm: agora, atualizadoPor: usuario.email };
    const ne = lerEmpenhos_().find(function (e) { return e.id === id; });
    if (ne && !ne.ativo) throw new Error('A NE ' + id + ' está desativada. Reative-a antes de importar.');

    let neCriada = false;
    if (!ne) {
      const registro = Object.assign({
        id: id, exercicio: exercicio, dataEmissao: dataDeIso_(dataEmissao), valorInicial: lido.valorInicial,
        idSei: idSeiNe, obs: obs
      }, carimbo);
      incluir_(ABAS.EMPENHOS, [registro]);
      gravarLog_('CRIAR', ABAS.EMPENHOS, id, null, registro);
      neCriada = true;
    }

    // Compara de novo dentro do lock: só entra o que ainda não está cadastrado.
    const linhasMov = listar_(ABAS.EMP_MOVIMENTOS);
    const doSistema = lerMovimentos_().filter(function (m) { return m.ativo && m.empenhoId === id; });
    const comparacao = compararNeImportada_(lido, ne || null, doSistema);
    let maior = 0;
    linhasMov.forEach(function (l) {
      const m = String(l.id).trim().match(/^MOV-(\d+)$/);
      if (m) maior = Math.max(maior, Number(m[1]));
    });
    let incluidos = 0;
    comparacao.movimentos.forEach(function (m, i) {
      if (m.status !== 'NOVO') return;
      maior++;
      const registro = Object.assign({
        id: 'MOV-' + ('000' + maior).slice(-4), empenhoId: id, tipo: m.tipo, data: dataDeIso_(m.data),
        valor: m.valor, idSei: lido.movimentos[i].idSei, obs: obs
      }, carimbo);
      incluir_(ABAS.EMP_MOVIMENTOS, [registro]);
      gravarLog_('CRIAR', ABAS.EMP_MOVIMENTOS, registro.id, null, registro);
      incluidos++;
    });

    const partes = [];
    if (neCriada) partes.push('NE ' + id + ' incluída');
    if (incluidos) partes.push(incluidos + (incluidos === 1 ? ' movimento incluído' : ' movimentos incluídos') + (neCriada ? '' : ' na NE ' + id));
    const mensagem = partes.length ? partes.join(' com ') + '.' : 'Nada novo para incluir na NE ' + id + ': tudo o que está no PDF já estava cadastrado.';
    const r = resultadoEmpenho_(mensagem, exercicio, [id]);
    r.avisos = comparacao.avisos.concat(r.avisos);
    return r;
  });
}

/** Valor em reais escrito no PDF ("109.094,95"). */
function reaisDoPdf_(s) {
  return arred2_(Math.abs(Number(String(s).replace(/\./g, '').replace(',', '.'))));
}

/**
 * Interpreta o texto da NE do SIAFI (sem dependência do Apps Script; testável).
 * Valor inicial = soma das operações "Inclusão"; cada "Reforço"/"Anulação" vira um movimento
 * (somado por dia). Lança erro com mensagem clara se o texto não for de uma NE da contratada.
 */
function interpretarTextoNe_(texto, nomeArquivo, cnpj) {
  const t = String(texto || '').replace(/ /g, ' ');
  if (!/nota\s+de\s+empenho/i.test(t)) throw new Error('Este PDF não parece ser uma nota de empenho do SIAFI.');
  const avisos = [];

  const digitosCnpj = String(cnpj || '').replace(/\D/g, '');
  if (digitosCnpj && t.replace(/[.\/\-\s]/g, '').indexOf(digitosCnpj) < 0) {
    throw new Error('O favorecido desta NE não é a contratada (CNPJ ' + cnpj + '). Confira se o PDF é da NE do Contrato 20/2025.');
  }

  // Número: "2026 NE 334" no corpo; "…2026NE000334…" no nome do arquivo baixado.
  const mTexto = t.match(/\b(20\d{2})\s+NE\s+(\d{1,6})\b/);
  const mNome = String(nomeArquivo || '').toUpperCase().match(/(20\d{2})NE(\d{6})/);
  const idTexto = mTexto ? mTexto[1] + 'NE' + ('000000' + mTexto[2]).slice(-6) : '';
  const idNome = mNome ? mNome[1] + 'NE' + mNome[2] : '';
  if (idTexto && idNome && idTexto !== idNome) {
    throw new Error('O número da NE no PDF (' + idTexto + ') é diferente do que está no nome do arquivo (' + idNome + ').');
  }
  const id = idTexto || idNome;
  if (!id) throw new Error('Não encontrei o número da NE (ano, "NE" e número) no PDF.');

  const dinheiro = '-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}(?!\\d)';
  // Data de emissão, tipo da NE e valor atual: "20/05/2026 Estimativo 0016668-09.2024 - 109.094,95".
  const mEmissao = t.match(new RegExp('(\\d{2})/(\\d{2})/(\\d{4})\\s+(Estimativo|Ordin[aá]rio|Global)\\b([\\s\\S]{0,300}?)(' + dinheiro + ')', 'i'));
  if (!mEmissao) throw new Error('Não encontrei a data de emissão e o valor da NE no PDF.');
  const dataEmissao = mEmissao[3] + '-' + mEmissao[2] + '-' + mEmissao[1];
  const valorTotal = reaisDoPdf_(mEmissao[6]);
  if (dataEmissao.slice(0, 4) !== id.slice(0, 4)) {
    throw new Error('A data de emissão (' + mEmissao[1] + '/' + mEmissao[2] + '/' + mEmissao[3] + ') não é do ano da NE ' + id + '.');
  }

  // Operações dos itens: "21/05/2026 Inclusão 1,00000 3.147,4200 3.147,42". A quantidade às vezes vem
  // quebrada em linhas ("900.000,000 / 00"): pega a sequência de números e usa o último valor em reais.
  const reOp = new RegExp('(\\d{2})/(\\d{2})/(\\d{4})\\s+(Inclus[aã]o|Refor[cç]o|Anula[cç][aã]o)(?:\\s+(?:Parcial|Total))?' +
    '((?:\\s+-?[\\d.,]+(?![\\d.,/]))+)', 'gi');
  const reDinheiro = new RegExp('^' + dinheiro + '$');
  let valorInicial = 0;
  const porDia = {};
  const ordem = [];
  let m;
  let operacoes = 0;
  while ((m = reOp.exec(t)) !== null) {
    operacoes++;
    const data = m[3] + '-' + m[2] + '-' + m[1];
    const nomeOp = m[4].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const tokens = m[5].trim().split(/\s+/);
    const emReais = tokens.filter(function (x) { return reDinheiro.test(x); });
    if (tokens.length < 2 || !emReais.length) continue;
    const valor = reaisDoPdf_(emReais[emReais.length - 1]);
    if (nomeOp === 'inclusao') {
      valorInicial = arred2_(valorInicial + valor);
      continue;
    }
    const tipo = nomeOp === 'reforco' ? 'REFORCO' : 'ANULACAO';
    const chave = tipo + '|' + data;
    if (!porDia[chave]) { porDia[chave] = { tipo: tipo, data: data, valor: 0 }; ordem.push(chave); }
    porDia[chave].valor = arred2_(porDia[chave].valor + valor);
  }
  if (!operacoes) throw new Error('Não encontrei as operações dos itens (Inclusão, Reforço, Anulação) no PDF. Use a "Impressão Completa" da NE.');
  if (!valorInicial) throw new Error('Não encontrei nenhuma operação de Inclusão no PDF.');

  const movimentos = ordem.map(function (c) { return porDia[c]; })
    .sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
  const liquido = arred2_(movimentos.reduce(function (s, x) {
    return s + (x.tipo === 'REFORCO' ? x.valor : -x.valor);
  }, valorInicial));
  if (Math.abs(liquido - valorTotal) >= 0.005) {
    avisos.push('A soma das operações lidas (' + formatarReais_(liquido) + ') não bate com o valor da NE no PDF (' +
      formatarReais_(valorTotal) + '). Pode haver operação que o sistema não reconheceu: confira o PDF antes de confirmar.');
  }
  return { id: id, exercicio: id.slice(0, 4), dataEmissao: dataEmissao, valorInicial: valorInicial, valorTotal: valorTotal,
    movimentos: movimentos, avisos: avisos };
}

/**
 * Compara o que foi lido do PDF com o que já está cadastrado (sem dependência do Apps Script).
 * Movimentos comparados por tipo e dia (somados). Divergência só gera aviso.
 */
function compararNeImportada_(lido, ne, movimentosAtivos) {
  const avisos = [];
  const doSistema = {};
  (movimentosAtivos || []).forEach(function (m) {
    const chave = m.tipo + '|' + m.data;
    doSistema[chave] = arred2_((doSistema[chave] || 0) + m.valor);
  });
  if (ne) {
    if (Math.abs(ne.valorInicial - lido.valorInicial) >= 0.005) {
      avisos.push('O valor inicial cadastrado da NE ' + ne.id + ' (' + formatarReais_(ne.valorInicial) + ') é diferente da soma das inclusões no PDF (' +
        formatarReais_(lido.valorInicial) + '). Nada foi alterado; se for o caso, corrija a NE na lista.');
    }
    if (ne.dataEmissao !== lido.dataEmissao) {
      avisos.push('A data de emissão cadastrada da NE ' + ne.id + ' (' + (ne.dataEmissao ? dataBr_(ne.dataEmissao) : 'vazia') + ') é diferente da do PDF (' + dataBr_(lido.dataEmissao) + ').');
    }
  }
  const usados = {};
  const movimentos = (lido.movimentos || []).map(function (x) {
    const chave = x.tipo + '|' + x.data;
    usados[chave] = true;
    const sistema = doSistema[chave] || 0;
    let status = 'NOVO';
    if (sistema && Math.abs(sistema - x.valor) < 0.005) status = 'JA_CADASTRADO';
    else if (sistema) {
      status = 'DIVERGENTE';
      const g = generoMovimento_(x.tipo);
      avisos.push(g.artigo + ' ' + TIPOS_MOVIMENTO[x.tipo].toLowerCase() + ' de ' + dataBr_(x.data) + ' está cadastrad' + g.final + ' com ' + formatarReais_(sistema) +
        ', mas no PDF é ' + formatarReais_(x.valor) + '. Não será incluíd' + g.final + '; corrija na lista se for o caso.');
    }
    return { tipo: x.tipo, data: x.data, valor: x.valor, status: status };
  });
  Object.keys(doSistema).forEach(function (chave) {
    if (usados[chave]) return;
    const p = chave.split('|');
    const g = generoMovimento_(p[0]);
    avisos.push(g.artigo + ' ' + TIPOS_MOVIMENTO[p[0]].toLowerCase() + ' de ' + dataBr_(p[1]) + ' (' + formatarReais_(doSistema[chave]) +
      ') está cadastrad' + g.final + ', mas não aparece no PDF.');
  });
  return { situacao: ne ? 'EXISTENTE' : 'NOVA', movimentos: movimentos, avisos: avisos };
}

function generoMovimento_(tipo) {
  return tipo === 'ANULACAO' ? { artigo: 'A', final: 'a' } : { artigo: 'O', final: 'o' };
}

/** Texto de um PDF enviado pelo navegador (base64). O PDF não é guardado. */
function textoDePdfEnviado_(arquivo, base64) {
  let bytes;
  try {
    bytes = Utilities.base64Decode(String(base64 || ''));
  } catch (e) {
    throw new Error('Não foi possível ler o arquivo "' + arquivo + '".');
  }
  if (!bytes.length) throw new Error('O arquivo "' + arquivo + '" está vazio.');
  if (bytes.length > 20 * 1024 * 1024) throw new Error('O arquivo "' + arquivo + '" passa de 20 MB.');
  if (bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70) {
    throw new Error('O arquivo "' + arquivo + '" não é um PDF.');
  }
  return textoDoBlob_(Utilities.newBlob(bytes, MimeType.PDF, arquivo), arquivo);
}

/* ---------- Importação do pagamento pela NF e pela OB (decisões de 18/11/2026) ---------- */

/**
 * Lê a NF (NFS-e) e/ou a OB do SIAFI enviadas pelo navegador e devolve a SUGESTÃO para o
 * formulário de pagamento. Nada é gravado: o fiscal confere e salva pelo formulário.
 * arquivos: [{ nome, base64 }] (1 ou 2).
 * Retorno: { sugestao: {id, competencia, empenhoId, tipo, numeroNF, dataNF, valorNF, situacao, valorPago,
 *            dataPagamento, idSei, obs}, existente, avisos, arquivos: [{nome, tipo, texto}] }
 */
function lerPdfsPagamento(arquivos) {
  requirePerfil_(perfisEmpenho_());
  exigirAbasEmpenho_();
  arquivos = arquivos || [];
  if (!arquivos.length || arquivos.length > 2) throw new Error('Escolha a NF, a OB ou as duas (no máximo 2 arquivos).');
  const config = lerConfig_();
  const cnpj = String(config.CNPJ || '');
  const lidos = { nf: null, ob: null };
  const saida = [];
  arquivos.forEach(function (a) {
    const nome = String(a.nome || 'arquivo.pdf').slice(0, 200);
    const texto = textoDePdfEnviado_(nome, a.base64);
    const tipo = tipoDocumentoPagamento_(texto);
    saida.push({ nome: nome, tipo: tipo, texto: texto });
    if (!tipo) throw new Error('O arquivo "' + nome + '" não foi reconhecido como NFS-e nem como ordem bancária (OB) do SIAFI.');
    if (lidos[tipo]) throw new Error('Foram escolhidas duas ' + (tipo === 'nf' ? 'notas fiscais' : 'OBs') + '. Escolha uma NF e/ou uma OB do mesmo pagamento.');
    lidos[tipo] = tipo === 'nf' ? interpretarTextoNf_(texto) : interpretarTextoOb_(texto);
  });
  const r = montarSugestaoPagamento_(lidos.nf, lidos.ob, {
    cnpj: cnpj,
    tolerancia: numeroConfigOu_(config, 'EMPENHO_TOLERANCIA_NF', 1),
    empenhos: lerEmpenhos_(),
    pagamentos: lerPagamentos_()
  });
  r.arquivos = saida;
  return r;
}

/** 'nf', 'ob' ou '' (sem dependência do Apps Script). */
function tipoDocumentoPagamento_(texto) {
  const t = String(texto || '');
  if (/ORDEM\s+BANCARIA|CONOB/i.test(t) && /\d{4}OB\d{6}/.test(t)) return 'ob';
  if (/Nota\s+Fiscal\s+de\s+Servi[cç]o/i.test(t) || /NFS-?e/i.test(t)) return 'nf';
  return '';
}

/** Dígitos do CNPJ da contratada aparecem no texto? (sem CNPJ na Config, não confere). */
function textoTemCnpj_(texto, cnpj) {
  const d = String(cnpj || '').replace(/\D/g, '');
  return !d || String(texto || '').replace(/[.\/\-\s]/g, '').indexOf(d) >= 0;
}

/** NFS-e (padrão nacional): número, emissão, valor total (bruto), valor líquido e período. */
function interpretarTextoNf_(texto) {
  const t = String(texto || '').replace(/ /g, ' ');
  const dinheiro = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2})(?!\\d)';
  const pega = function (re) { const m = t.match(re); return m ? m[1] : ''; };
  const numero = pega(/N[uú]mero\s+da\s+NFS-?e\s*:?\s*(\d{1,15})\b/i);
  const emissao = t.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s+\d{2}:\d{2}/);
  const total = pega(new RegExp('Valor\\s+Total\\s*:?\\s*' + dinheiro, 'i')) || pega(new RegExp('Valor\\s+Servi[cç]o\\s*:?\\s*' + dinheiro, 'i'));
  const liquido = pega(new RegExp('Valor\\s+L[ií]quido\\s*:?\\s*' + dinheiro, 'i'));
  const periodo = t.match(/Per[ií]odo\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})\s*(?:a|até|-)\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  return {
    texto: t,
    numero: numero ? String(Number(numero)) : '',
    dataEmissao: emissao ? emissao[3] + '-' + emissao[2] + '-' + emissao[1] : '',
    valorTotal: total ? reaisDoPdf_(total) : null,
    valorLiquido: liquido ? reaisDoPdf_(liquido) : null,
    competencia: periodo ? periodo[3] + '-' + periodo[2] : '',
    periodoOutroMes: !!periodo && (periodo[3] + periodo[2]) !== (periodo[6] + periodo[5])
  };
}

const MESES_ABREV_OB = { JAN: 1, FEV: 2, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAI: 5, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8,
  SET: 9, SEP: 9, OUT: 10, OCT: 10, NOV: 11, DEZ: 12, DEC: 12 };

/** "18Jun26" ou "18Jun2026" → '2026-06-18'. */
function dataSiafi_(dia, mes, ano) {
  const m = MESES_ABREV_OB[String(mes).toUpperCase()];
  if (!m) return '';
  const a = String(ano).length === 2 ? '20' + ano : String(ano);
  return a + '-' + ('0' + m).slice(-2) + '-' + ('0' + dia).slice(-2);
}

/** OB do SIAFI (CONOB): número, data, valor, favorecido, NE(s), NF citada e mês de referência. */
function interpretarTextoOb_(texto) {
  const t = String(texto || '').replace(/ /g, ' ');
  const numero = (t.match(/\b(\d{4}OB\d{6})\b/) || [])[1] || '';
  const liq = t.match(/LIQUIDACAO\s*:?\s*(\d{2})([A-Za-z]{3})(\d{4}|\d{2})\b/i);
  const emi = t.match(/DATA\s+EMISSAO\s*:?\s*(\d{2})([A-Za-z]{3})(\d{4}|\d{2})\b/i);
  const data = liq ? dataSiafi_(liq[1], liq[2], liq[3]) : emi ? dataSiafi_(emi[1], emi[2], emi[3]) : '';
  const valor = (t.match(/VALOR\s*:\s*(\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)/i) || [])[1];
  const favorecido = ((t.match(/FAVORECIDO\s*:\s*([\d.\/\-]{14,20})/i) || [])[1] || '').replace(/\D/g, '');
  const nes = (t.match(/\d{4}NE\d{6}/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; });
  const nf = (t.match(/\bNF\s*(?:N[º°o]\.?\s*)?(\d{1,15})\b/i) || [])[1] || '';
  const mes = t.match(/M[EÊ]S\s+DE\s+([A-ZÇ]+)\s+DE\s+(\d{4})/i);
  let competencia = '';
  if (mes) {
    const nomeMes = mes[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const i = MESES_EMPENHO.map(function (x) { return x.normalize('NFD').replace(/[̀-ͯ]/g, ''); }).indexOf(nomeMes);
    if (i >= 0) competencia = mes[2] + '-' + ('0' + (i + 1)).slice(-2);
  }
  return {
    texto: t, numero: numero, data: data, valor: valor ? reaisDoPdf_(valor) : null,
    favorecido: favorecido, nes: nes, nf: nf ? String(Number(nf)) : '', competencia: competencia
  };
}

/**
 * Junta NF e OB na sugestão do formulário (sem dependência do Apps Script; testável).
 * Valor da NF e valor pago = valor TOTAL (bruto) da NF; a OB confirma o pagamento e a data.
 * Se já existe pagamento ativo com o mesmo número de NF, a sugestão é a edição dele.
 */
function montarSugestaoPagamento_(nf, ob, ctx) {
  const avisos = [];
  const tolerancia = Number(ctx.tolerancia) || 0;
  if (nf) {
    if (!textoTemCnpj_(nf.texto, ctx.cnpj)) avisos.push('O CNPJ da contratada (' + ctx.cnpj + ') não aparece na NF. Confira se a nota é da Omnicentral.');
    if (!nf.numero) avisos.push('Não encontrei o número da NFS-e: preencha à mão.');
    if (!nf.dataEmissao) avisos.push('Não encontrei a data de emissão da NF: preencha à mão.');
    if (nf.valorTotal === null) avisos.push('Não encontrei o valor total da NF: preencha à mão.');
    if (nf.periodoOutroMes) avisos.push('O período da NF passa de um mês: confira a competência.');
  }
  if (ob) {
    const d = String(ctx.cnpj || '').replace(/\D/g, '');
    if (d && ob.favorecido && ob.favorecido !== d) avisos.push('O favorecido da OB ' + ob.numero + ' não é a contratada.');
    if (!ob.data) avisos.push('Não encontrei a data da OB: preencha a data do pagamento à mão.');
    if (ob.nes.length > 1) avisos.push('A OB cita mais de uma NE (' + ob.nes.join(', ') + '): foi sugerida a primeira.');
    if (!ob.nes.length) avisos.push('Não encontrei a NE na OB: escolha a nota de empenho à mão.');
  }
  if (nf && ob) {
    if (ob.nf && nf.numero && ob.nf !== nf.numero) avisos.push('A OB cita a NF ' + ob.nf + ', mas a NF escolhida é a ' + nf.numero + '. Confira se são do mesmo pagamento.');
    if (ob.valor !== null && nf.valorLiquido !== null && Math.abs(ob.valor - nf.valorLiquido) > tolerancia) {
      avisos.push('O valor da OB (' + formatarReais_(ob.valor) + ') difere do valor líquido da NF (' + formatarReais_(nf.valorLiquido) +
        ') em ' + formatarReais_(arred2_(ob.valor - nf.valorLiquido)) + '.');
    }
    if (nf.competencia && ob.competencia && nf.competencia !== ob.competencia) {
      avisos.push('O período da NF (' + rotuloMesEmpenho_(nf.competencia) + ') é diferente do mês citado na OB (' + rotuloMesEmpenho_(ob.competencia) + '). Foi usado o da NF.');
    }
  }

  const numeroNF = (nf && nf.numero) || (ob && ob.nf) || '';
  const existente = numeroNF ? (ctx.pagamentos || []).find(function (p) {
    return p.ativo && String(Number(p.numeroNF.replace(/\D/g, '') || NaN)) === numeroNF;
  }) : null;

  const s = existente ? {
    id: existente.id, competencia: existente.competencia, empenhoId: existente.empenhoId, tipo: existente.tipo,
    numeroNF: existente.numeroNF, dataNF: existente.dataNF, valorNF: existente.valorNF, situacao: existente.situacao,
    valorPago: existente.valorPago, dataPagamento: existente.dataPagamento, idSei: existente.idSei, obs: existente.obs
  } : { id: '', competencia: '', empenhoId: '', tipo: 'MENSAL', numeroNF: '', dataNF: '', valorNF: null, situacao: 'A_PAGAR',
    valorPago: null, dataPagamento: '', idSei: '', obs: '' };

  if (existente) {
    avisos.unshift('Já existe o pagamento ' + existente.id + ' com a NF ' + numeroNF + ': ele foi aberto para edição com os dados importados.');
    if (nf && nf.valorTotal !== null && Math.abs(nf.valorTotal - existente.valorNF) >= 0.005) {
      avisos.push('O valor da NF no pagamento ' + existente.id + ' (' + formatarReais_(existente.valorNF) + ') é diferente do valor total da NF importada (' +
        formatarReais_(nf.valorTotal) + '). Foi sugerido o da NF importada.');
    }
  }
  if (nf) {
    if (nf.competencia) s.competencia = nf.competencia;
    if (nf.numero) s.numeroNF = nf.numero;
    if (nf.dataEmissao) s.dataNF = nf.dataEmissao;
    if (nf.valorTotal !== null) s.valorNF = nf.valorTotal;
  }
  if (ob) {
    if (!s.competencia && ob.competencia) s.competencia = ob.competencia;
    if (!s.numeroNF && ob.nf) s.numeroNF = ob.nf;
    if (ob.nes.length) s.empenhoId = ob.nes[0];
    s.situacao = 'PAGO';
    s.valorPago = s.valorNF;
    if (ob.data) s.dataPagamento = ob.data;
    if (s.valorNF === null) avisos.push('Só a OB foi lida e não há pagamento cadastrado com a NF ' + (s.numeroNF || '') +
      ': importe também a NF, ou informe o valor total (bruto) da NF à mão. O valor pago é o bruto da NF, não o da OB.');
  }
  if (!s.competencia) avisos.push('Não encontrei a competência (período da NF ou mês citado na OB): preencha à mão.');
  if (!s.empenhoId) avisos.push('A NF não informa a nota de empenho: escolha a NE no formulário.');
  if (s.empenhoId) {
    const ne = (ctx.empenhos || []).find(function (e) { return e.id === s.empenhoId; });
    if (!ne) avisos.push('A NE ' + s.empenhoId + ' da OB não está cadastrada. Importe a NE antes de salvar o pagamento.');
    else if (!ne.ativo) avisos.push('A NE ' + s.empenhoId + ' da OB está desativada.');
  }
  const partesObs = [];
  if (nf && nf.numero) partesObs.push('NF ' + nf.numero);
  if (ob && ob.numero) partesObs.push('OB ' + ob.numero + (ob.valor !== null ? ' (líquido ' + formatarReais_(ob.valor) + ')' : ''));
  if (partesObs.length && (!s.obs || !existente)) s.obs = 'Importado: ' + partesObs.join(' · ') + '.';
  else if (partesObs.length && s.obs.indexOf(partesObs[partesObs.length - 1]) < 0) s.obs = (s.obs + ' Importado: ' + partesObs.join(' · ') + '.').slice(0, 500);
  return { sugestao: s, existente: !!existente, avisos: avisos };
}

/** dados: { id (vazio = novo), competencia, empenhoId, tipo, numeroNF, dataNF, valorNF, situacao, valorPago, dataPagamento, idSei, obs } */
function salvarPagamento(dados) {
  const usuario = requirePerfil_(perfisEmpenho_());
  exigirAbasEmpenho_();
  dados = dados || {};
  const tipo = String(dados.tipo || '').trim();
  if (!TIPOS_PAGAMENTO[tipo]) throw new Error('Escolha o tipo do pagamento (mensal, retroativo ou outro).');
  const situacao = String(dados.situacao || '').trim();
  if (!SITUACOES_PAGAMENTO[situacao]) throw new Error('Escolha a situação do pagamento (a pagar ou pago).');
  const competencia = validarFormatoCompetencia_(dados.competencia);
  const empenhoId = String(dados.empenhoId || '').trim().toUpperCase();
  const numeroNF = textoLivre_(dados.numeroNF, 40);
  if (!numeroNF) throw new Error('Informe o número da nota fiscal.');
  const dataNF = lerDataEmpenho_(dados.dataNF, 'Data da NF', true);
  const novo = {
    competencia: competencia,
    empenhoId: empenhoId,
    tipo: tipo,
    numeroNF: numeroNF,
    dataNF: dataDeIso_(dataNF),
    valorNF: lerValorReais_(dados.valorNF, 'Valor da NF', true, false),
    situacao: situacao,
    valorPago: '',
    dataPagamento: '',
    idSei: lerIdSeiEmpenho_(dados.idSei),
    obs: textoLivre_(dados.obs, 500)
  };
  if (situacao === 'PAGO') {
    novo.valorPago = lerValorReais_(dados.valorPago, 'Valor pago', true, false);
    const dataPagamento = lerDataEmpenho_(dados.dataPagamento, 'Data do pagamento', true);
    if (dataPagamento < dataNF) throw new Error('A data do pagamento não pode ser anterior à data da NF.');
    novo.dataPagamento = dataDeIso_(dataPagamento);
  }

  return comLock_(function () {
    const ne = neAtivaOuErro_(empenhoId);
    const idAtual = String(dados.id || '').trim();
    const avisos = [];
    if (tipo === 'MENSAL' && lerPagamentos_().some(function (p) {
      return p.ativo && p.id !== idAtual && p.tipo === 'MENSAL' && p.competencia === competencia && p.empenhoId === empenhoId;
    })) {
      avisos.push('Já existe outro pagamento mensal da competência ' + rotuloMesEmpenho_(competencia) + ' na NE ' + empenhoId + '. Confira se não está repetido.');
    }
    const r = gravarRegistroComId_(ABAS.PAGAMENTOS, 'PAG', idAtual, novo, usuario,
      function (id, criado) { return 'Pagamento ' + id + ' (' + rotuloMesEmpenho_(competencia) + ') ' + (criado ? 'incluído.' : 'atualizado.'); },
      ne.exercicio, [ne.id], competencia);
    r.avisos = avisos.concat(r.avisos);
    return r;
  });
}

/** dados: { ref (vazio = nova), competencia, item, quantidadePrevista, obs } */
function salvarPrevisao(dados) {
  const usuario = requirePerfil_(perfisEmpenho_());
  exigirAbasEmpenho_();
  dados = dados || {};
  const competencia = validarFormatoCompetencia_(dados.competencia);
  const exercicio = competencia.slice(0, 4);
  const item = Number(dados.item);
  if (!listarItens_().some(function (it) { return it.item === item; })) throw new Error('Escolha um item do contrato.');
  const qtd = String(dados.quantidadePrevista === undefined ? '' : dados.quantidadePrevista).trim().replace(/\./g, '');
  if (!/^\d+$/.test(qtd)) throw new Error('A quantidade prevista deve ser um número inteiro maior ou igual a 0.');
  const obs = textoLivre_(dados.obs, 300);
  if (!obs) throw new Error('A observação da previsão é obrigatória (ex.: "eleição suplementar de Nova Olinda").');
  const novo = { exercicio: exercicio, competencia: competencia, item: item, quantidadePrevista: Number(qtd), obs: obs };
  const chave = exercicio + '/' + competencia + '/' + item;

  return comLock_(function () {
    const vigencias = listar_(ABAS.VIGENCIAS).map(function (v) { return { id: String(v.id).trim(), inicio: dataIso_(v.inicio), fim: dataIso_(v.fim) }; });
    if (!vigenciaDoMes_(competencia, vigencias)) throw new Error('A competência ' + rotuloMesEmpenho_(competencia) + ' não está dentro de uma vigência cadastrada.');
    const previsoes = lerPrevisoes_();
    const ref = Number(dados.ref) || 0;
    const repetida = previsoes.find(function (p) {
      return p.ativo && p.ref !== ref && p.exercicio === exercicio && p.competencia === competencia && p.item === item;
    });
    if (repetida) throw new Error('Já existe uma previsão ativa do item ' + item + ' em ' + rotuloMesEmpenho_(competencia) + '. Edite a que já existe.');
    const agora = new Date();
    if (ref) {
      const atual = previsoes.find(function (p) { return p.ref === ref; });
      if (!atual) throw new Error('Previsão não encontrada. Atualize a tela.');
      const linha = listar_(ABAS.EMP_PREVISOES).find(function (l) { return l._linha === ref; });
      const mudancas = diferencas_(linha, novo);
      if (!Object.keys(mudancas).length) return resultadoEmpenho_('Nenhuma alteração na previsão.', exercicio, []);
      const antes = selecionar_(linha, Object.keys(mudancas));
      mudancas.atualizadoEm = agora;
      mudancas.atualizadoPor = usuario.email;
      atualizar_(ABAS.EMP_PREVISOES, ref, mudancas);
      gravarLog_('EDITAR', ABAS.EMP_PREVISOES, chave, antes, mudancas);
      return resultadoEmpenho_('Previsão do item ' + item + ' em ' + rotuloMesEmpenho_(competencia) + ' atualizada.', exercicio, []);
    }
    const registro = Object.assign({}, novo, { ativo: true, criadoEm: agora, criadoPor: usuario.email, atualizadoEm: agora, atualizadoPor: usuario.email });
    incluir_(ABAS.EMP_PREVISOES, [registro]);
    gravarLog_('CRIAR', ABAS.EMP_PREVISOES, chave, null, registro);
    return resultadoEmpenho_('Previsão do item ' + item + ' em ' + rotuloMesEmpenho_(competencia) + ' incluída.', exercicio, []);
  });
}

/**
 * Desativa ou reativa um registro (nada é apagado).
 * entidade: 'NE' | 'MOV' | 'PAG' | 'PREV'; chave: id da NE/movimento/pagamento ou ref da previsão.
 */
function alterarAtivoEmpenho(entidade, chave, ativo, exercicioTela) {
  const usuario = requirePerfil_(perfisEmpenho_());
  exigirAbasEmpenho_();
  const ligar = ativo === true;
  const abas = { NE: ABAS.EMPENHOS, MOV: ABAS.EMP_MOVIMENTOS, PAG: ABAS.PAGAMENTOS, PREV: ABAS.EMP_PREVISOES };
  const aba = abas[entidade];
  if (!aba) throw new Error('Tipo de registro desconhecido.');
  const alvo = String(chave || '').trim();

  return comLock_(function () {
    let registro, linha, chaveLog, rotulo, exercicio = exercicioTela, nes = [];
    if (entidade === 'NE') {
      registro = lerEmpenhos_().find(function (e) { return e.id === alvo.toUpperCase(); });
      if (!registro) throw new Error('NE não encontrada.');
      if (!ligar) {
        const ligados = lerMovimentos_().filter(function (m) { return m.ativo && m.empenhoId === registro.id; }).length +
          lerPagamentos_().filter(function (p) { return p.ativo && p.empenhoId === registro.id; }).length;
        if (ligados) throw new Error('A NE ' + registro.id + ' tem ' + ligados + ' movimento(s) ou pagamento(s) ativo(s). Desative-os antes.');
      }
      chaveLog = registro.id; rotulo = 'NE ' + registro.id; exercicio = registro.exercicio; nes = [registro.id];
    } else if (entidade === 'PREV') {
      const previsoes = lerPrevisoes_();
      registro = previsoes.find(function (p) { return p.ref === Number(alvo); });
      if (!registro) throw new Error('Previsão não encontrada. Atualize a tela.');
      if (ligar && previsoes.some(function (p) {
        return p.ativo && p.ref !== registro.ref && p.exercicio === registro.exercicio && p.competencia === registro.competencia && p.item === registro.item;
      })) throw new Error('Já existe outra previsão ativa do item ' + registro.item + ' em ' + rotuloMesEmpenho_(registro.competencia) + '.');
      chaveLog = registro.exercicio + '/' + registro.competencia + '/' + registro.item;
      rotulo = 'Previsão do item ' + registro.item + ' em ' + rotuloMesEmpenho_(registro.competencia);
      exercicio = registro.exercicio;
    } else {
      registro = (entidade === 'MOV' ? lerMovimentos_() : lerPagamentos_()).find(function (r) { return r.id === alvo; });
      if (!registro) throw new Error('Registro ' + alvo + ' não encontrado.');
      if (ligar) neAtivaOuErro_(registro.empenhoId);
      const ne = lerEmpenhos_().find(function (e) { return e.id === registro.empenhoId; });
      chaveLog = registro.id;
      rotulo = (entidade === 'MOV' ? 'Movimento ' : 'Pagamento ') + registro.id;
      exercicio = ne ? ne.exercicio : exercicioTela;
      nes = [registro.empenhoId];
    }
    if (registro.ativo === ligar) return resultadoEmpenho_(rotulo + ' já estava ' + (ligar ? 'ativo' : 'desativado') + '.', exercicio, nes);
    linha = registro._linha;
    atualizar_(aba, linha, { ativo: ligar, atualizadoEm: new Date(), atualizadoPor: usuario.email });
    gravarLog_(ligar ? 'EDITAR' : 'DESATIVAR', aba, chaveLog, { ativo: !ligar }, { ativo: ligar });
    return resultadoEmpenho_(rotulo + (ligar ? ' reativado.' : ' desativado.'), exercicio, nes);
  });
}

/** SUPERADMIN: grava uma chave EMPENHO_* da Config (com Log). */
function salvarParametroEmpenho(chave, valor, exercicioTela) {
  requirePerfil_([PERFIS.SUPERADMIN]);
  exigirAbasEmpenho_();
  const def = PARAMETROS_EMPENHO.find(function (p) { return p.chave === chave; });
  if (!def) throw new Error('Parâmetro desconhecido: ' + chave + '.');
  const novo = validarParametroEmpenho_(def, valor);
  return comLock_(function () {
    const linha = listar_(ABAS.CONFIG).find(function (c) { return String(c.chave).trim() === chave; });
    if (linha) {
      if (valorComparavel_(linha.valor) === valorComparavel_(novo)) {
        return resultadoEmpenho_('Nenhuma alteração em "' + def.rotulo + '".', exercicioTela, []);
      }
      atualizar_(ABAS.CONFIG, linha._linha, { valor: novo });
      gravarLog_('CONFIG', ABAS.CONFIG, chave, { valor: linha.valor }, { valor: novo });
    } else {
      incluir_(ABAS.CONFIG, [{ chave: chave, valor: novo, descricao: '' }]);
      gravarLog_('CONFIG', ABAS.CONFIG, chave, null, { valor: novo });
    }
    return resultadoEmpenho_('"' + def.rotulo + '" salvo.', chave === 'EMPENHO_EXERCICIO' ? String(novo) : exercicioTela, []);
  });
}

function validarParametroEmpenho_(def, valor) {
  const texto = String(valor === undefined || valor === null ? '' : valor).trim();
  const rotulo = '"' + def.rotulo + '"';
  if (!texto && def.opcional) return '';
  switch (def.tipo) {
    case 'ano':
      if (!/^\d{4}$/.test(texto) || Number(texto) < 2025 || Number(texto) > 2100) throw new Error(rotulo + ' deve ser um ano (ex.: 2026).');
      return texto;
    case 'percentual': {
      const n = lerPercentual_(texto);
      if (n === null) throw new Error(rotulo + ' deve ser um número entre 0 e 100 (ex.: 10).');
      return Math.round(n * 100) / 10000;
    }
    case 'data':
      return dataDeIso_(validarDataIso_(texto, def.rotulo));
    case 'inteiro':
      if (!/^\d+$/.test(texto) || Number(texto) > 365) throw new Error(rotulo + ' deve ser um número inteiro entre 0 e 365.');
      return Number(texto);
    case 'reais':
      return lerValorReais_(texto, def.rotulo, true, true);
    case 'texto':
      if (!texto) throw new Error('Preencha ' + rotulo + '.');
      if (texto.length > 200) throw new Error(rotulo + ' deve ter no máximo 200 caracteres.');
      return texto;
  }
  throw new Error('Tipo de parâmetro sem validação: ' + def.tipo + '.');
}

function valorParametroEmpenhoTela_(def, valor) {
  if (valor === '' || valor === null || valor === undefined) return '';
  switch (def.tipo) {
    case 'percentual': return percentualTexto_(numeroPlanilha_(valor) || 0);
    case 'data': return dataConfig_(valor);
    case 'reais': return numeroReais_(numeroPlanilha_(valor) || 0);
    default: return String(valor);
  }
}

/* ---------- Auxiliares de gravação ---------- */

function neAtivaOuErro_(empenhoId) {
  const ne = lerEmpenhos_().find(function (e) { return e.id === empenhoId; });
  if (!ne) throw new Error('Escolha uma nota de empenho cadastrada.');
  if (!ne.ativo) throw new Error('A NE ' + empenhoId + ' está desativada.');
  return ne;
}

/** Inclui (id gerado PREFIXO-0001) ou atualiza um registro de aba com coluna id. */
function gravarRegistroComId_(aba, prefixo, idAtual, novo, usuario, mensagem, exercicio, nes, competencia) {
  const linhas = listar_(aba);
  const agora = new Date();
  if (idAtual) {
    const linha = linhas.find(function (l) { return String(l.id).trim() === idAtual; });
    if (!linha) throw new Error('Registro ' + idAtual + ' não encontrado. Atualize a tela.');
    if (!ehVerdadeiro_(linha.ativo)) throw new Error('O registro ' + idAtual + ' está desativado. Reative-o antes de editar.');
    const mudancas = diferencas_(linha, novo);
    if (!Object.keys(mudancas).length) return resultadoEmpenho_('Nenhuma alteração em ' + idAtual + '.', exercicio, nes, competencia);
    const antes = selecionar_(linha, Object.keys(mudancas));
    mudancas.atualizadoEm = agora;
    mudancas.atualizadoPor = usuario.email;
    atualizar_(aba, linha._linha, mudancas);
    gravarLog_('EDITAR', aba, idAtual, antes, mudancas);
    return resultadoEmpenho_(mensagem(idAtual, false), exercicio, nes, competencia);
  }
  let maior = 0;
  const padrao = new RegExp('^' + prefixo + '-(\\d+)$');
  linhas.forEach(function (l) {
    const m = String(l.id).trim().match(padrao);
    if (m) maior = Math.max(maior, Number(m[1]));
  });
  const id = prefixo + '-' + ('000' + (maior + 1)).slice(-4);
  const registro = Object.assign({ id: id }, novo, {
    ativo: true, criadoEm: agora, criadoPor: usuario.email, atualizadoEm: agora, atualizadoPor: usuario.email
  });
  incluir_(aba, [registro]);
  gravarLog_('CRIAR', aba, id, null, registro);
  return resultadoEmpenho_(mensagem(id, true), exercicio, nes, competencia);
}

/** Resposta padrão das gravações: mensagem, avisos ligados ao registro e a tela recalculada. */
function resultadoEmpenho_(mensagem, exercicio, nes, competencia) {
  const usuario = getUsuarioAtual_();
  const empenho = montarEmpenho_(exercicio, usuario);
  const avisos = [];
  (nes || []).forEach(function (id) {
    const n = empenho.calc.nes.find(function (x) { return x.id === id; });
    if (n && n.liquido < 0) avisos.push('A NE ' + id + ' ficou com valor líquido negativo (' + formatarReais_(n.liquido) + ').');
    else if (n && n.saldo < 0) avisos.push('Os pagamentos e valores a pagar da NE ' + id + ' passam do valor empenhado líquido em ' + formatarReais_(-n.saldo) + '.');
  });
  if (competencia) {
    const mes = empenho.calc.meses.find(function (m) { return m.competencia === competencia; });
    if (mes && mes.alertaNF) {
      avisos.push('A NF mensal de ' + rotuloMesEmpenho_(competencia) + ' difere do valor estimado em ' + formatarReais_(mes.diferencaNF) + '.');
    }
  }
  return { mensagem: mensagem, avisos: avisos, empenho: empenho };
}

/** Valor em reais digitado ("1.234,56", "1234,56" ou "1234.56"). */
function lerValorReais_(valor, rotulo, obrigatorio, aceitaZero) {
  let s = String(valor === undefined || valor === null ? '' : valor).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!s) {
    if (obrigatorio) throw new Error('Informe o campo "' + rotulo + '".');
    return '';
  }
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('"' + rotulo + '" inválido. Use o formato 1.234,56.');
  const n = arred2_(Number(s));
  if (n < 0 || (!aceitaZero && n === 0)) throw new Error('"' + rotulo + '" deve ser maior que zero.');
  return n;
}

function lerDataEmpenho_(valor, rotulo, obrigatoria) {
  const texto = String(valor || '').trim();
  if (!texto) {
    if (obrigatoria) throw new Error('Informe o campo "' + rotulo + '".');
    return '';
  }
  return validarDataIso_(texto, rotulo);
}

function lerIdSeiEmpenho_(valor) {
  const s = String(valor || '').trim();
  if (s && !/^\d{1,12}$/.test(s)) throw new Error('O ID do SEI deve ter só números.');
  return s;
}

function textoLivre_(valor, max) {
  const s = String(valor || '').trim().replace(/\s+/g, ' ');
  if (s.length > max) throw new Error('Texto com mais de ' + max + ' caracteres.');
  return s;
}

/* ====================================================================== */
/* Lembrete por e-mail (chamado pelo Lembrete.js)                          */
/* ====================================================================== */

/** E-mails (normalizados) dos usuários ativos que podem ver o módulo: { email: true }. */
function emailsComAcessoEmpenho_() {
  const r = {};
  listar_(ABAS.USUARIOS).forEach(function (u) {
    if (ehVerdadeiro_(u.ativo) && temAcessoEmpenho_(String(u.perfil).trim())) r[normalizarEmail_(u.email)] = true;
  });
  return r;
}

/**
 * Aviso de prazo do empenho para o e-mail de hoje, ou null.
 * forcar = true (testarLembrete): monta o bloco mesmo fora da janela e sem conferir o que já foi enviado.
 * Retorno: { chaves: [chaves do Log], assunto, bloco: { titulo, itens } }
 */
function avisoEmpenhoDoDia_(hoje, feriados, enviados, forcar) {
  if (!abasEmpenhoExistem_()) return null;
  const config = lerConfig_();
  const exercicio = exercicioPadrao_(config);
  const prazo = prazoEmpenho_(config, hoje);
  let chaves = [];
  if (!forcar) {
    const marcos = marcosAvisoEmpenho_(prazo, hoje, feriados);
    if (!marcos.length) return null;
    const prefixo = 'empenho/' + exercicio + '/' + prazo.dataLimite + '/';
    if (enviados[prefixo + marcos[marcos.length - 1]]) return null;
    chaves = marcos.filter(function (m) { return !enviados[prefixo + m]; }).map(function (m) { return prefixo + m; });
  }
  const calc = calcularEmpenho_(lerDadosEmpenho_(exercicio, config));
  return {
    chaves: chaves,
    assunto: 'Empenho ' + exercicio + ': ' + (prazo.dataLimite ? 'prazo em ' + dataBr_(prazo.dataLimite) + ' – ' : '') + calc.indicacao.texto,
    bloco: {
      titulo: 'Acompanhamento do Empenho ' + exercicio,
      itens: [
        prazo.texto,
        'Saldo disponível: ' + formatarReais_(calc.totais.saldo) + '.',
        'Necessidade até dezembro: ' + formatarReais_(calc.necessidade.provavel) + ' provável (mínimo ' +
          formatarReais_(calc.necessidade.minimo) + ', máximo ' + formatarReais_(calc.necessidade.maximo) + ').',
        'Indicação atual: ' + calc.indicacao.texto + '.'
      ]
    }
  };
}
