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
