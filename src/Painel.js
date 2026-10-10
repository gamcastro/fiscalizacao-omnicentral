/**
 * Painel.js – saldos da vigência, pendências e alertas, tabela de competências.
 * As regras de alerta e de dias úteis trabalham com datas em texto 'yyyy-MM-dd'
 * e não dependem do Apps Script, para poderem ser testadas fora dele.
 */

const CAMPOS_IDS_SEI = [
  { campo: 'idRelConsumo', rotulo: 'Relatório de Consumo' },
  { campo: 'idRelANS', rotulo: 'Relatório do ANS' },
  { campo: 'idAtesto', rotulo: 'Atesto' },
  { campo: 'idDespacho', rotulo: 'Despacho' }
];

/** Prazo, em dias úteis a partir do 1º dia útil do mês seguinte, para os 4 IDs do SEI. */
const PRAZO_IDS_SEI_DIAS_UTEIS = 10;

function getPainel() {
  const usuario = requirePerfil_(TODOS_PERFIS);
  const config = lerConfig_();
  const vigenciaId = String(config.VIGENCIA_ATUAL || '').trim();
  const registroVigencia = listar_(ABAS.VIGENCIAS).find(function (v) { return String(v.id).trim() === vigenciaId; });
  if (!registroVigencia) {
    throw new Error('A vigência atual (VIGENCIA_ATUAL = ' + vigenciaId + ') não está cadastrada na aba Vigencias.');
  }
  const vigencia = {
    id: vigenciaId,
    inicio: dataIso_(registroVigencia.inicio),
    fim: dataIso_(registroVigencia.fim),
    documento: String(registroVigencia.documento || '')
  };
  const alertaSaldo = numeroConfig_(config, 'ALERTA_SALDO');
  const hoje = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');

  const competencias = listar_(ABAS.COMPETENCIAS)
    .filter(function (c) { return String(c.vigencia).trim() === vigenciaId; })
    .map(function (c) {
      const faltando = CAMPOS_IDS_SEI.filter(function (f) { return String(c[f.campo] || '').trim() === ''; });
      return {
        competencia: textoCompetencia_(c.competencia),
        status: String(c.status),
        statusRotulo: STATUS_ROTULOS[c.status] || String(c.status),
        ansUptimePct: numeroOuNulo_(c.ansUptimePct),
        ansMinutos: numeroOuNulo_(c.ansMinutos),
        ansCumprido: c.ansCumprido === '' ? null : ehVerdadeiro_(c.ansCumprido),
        idsPreenchidos: CAMPOS_IDS_SEI.length - faltando.length,
        idsFaltando: faltando.map(function (f) { return f.rotulo; })
      };
    })
    .sort(function (a, b) { return a.competencia < b.competencia ? 1 : -1; });

  const consumo = consumoDaVigencia_(vigenciaId);
  const contratadas = {};
  quantidadesContratadas_(vigenciaId).forEach(function (q) { contratadas[q.item] = q.contratado; });
  const saldos = listarItens_().map(function (it) {
    const contratado = contratadas[it.item] || 0;
    const consumido = consumo[it.item] || 0;
    return {
      item: it.item,
      descricao: it.descricao,
      unidade: it.unidade,
      tipo: it.tipo,
      contratado: contratado,
      consumido: consumido,
      saldo: contratado - consumido,
      fracao: contratado > 0 ? consumido / contratado : 0
    };
  });

  const feriados = lerFeriados_();
  const alertas = calcularAlertas_({
    hoje: hoje,
    vigencia: vigencia,
    competencias: competencias,
    saldos: saldos,
    alertaSaldo: alertaSaldo,
    feriados: feriados || []
  });
  if (feriados === null) {
    alertas.unshift({
      tipo: 'config', nivel: 'alerta',
      texto: 'A aba Feriados não existe: os dias úteis estão sendo contados só sem sábados e domingos. Peça ao superadmin para rodar setup().'
    });
  }

  return {
    hoje: hoje,
    vigencia: vigencia,
    alertaSaldo: alertaSaldo,
    ansLimiteMin: numeroConfig_(config, 'ANS_LIMITE_MIN'),
    podeLancar: usuario.perfil === PERFIS.SUPERADMIN || usuario.perfil === PERFIS.FISCAL_TECNICO,
    saldos: saldos,
    alertas: alertas,
    competencias: competencias
  };
}

/** Datas da aba Feriados em 'yyyy-MM-dd', ou null se a aba não existir. */
function lerFeriados_() {
  if (!planilha_().getSheetByName(ABAS.FERIADOS)) return null;
  return listar_(ABAS.FERIADOS).map(function (f) { return dataIso_(f.data); }).filter(String);
}

/* ---------- Regras de alerta (sem dependência do Apps Script) ---------- */

/**
 * dados: { hoje, vigencia: { inicio, fim }, competencias, saldos, alertaSaldo, feriados }
 * Retorna [{ tipo, nivel ('alerta' | 'critico'), texto, competencia? }].
 */
function calcularAlertas_(dados) {
  const feriados = {};
  dados.feriados.forEach(function (d) { feriados[d] = true; });
  const alertas = [];
  const lancadas = {};
  dados.competencias.forEach(function (c) { lancadas[c.competencia] = c; });

  // 1. Saldo da vigência
  dados.saldos.forEach(function (s) {
    if (s.contratado > 0 && s.fracao >= dados.alertaSaldo) {
      alertas.push({
        tipo: 'saldo',
        nivel: s.fracao >= 1 ? 'critico' : 'alerta',
        texto: 'Item ' + s.item + ' (' + s.descricao + '): ' + formatarPercentual_(s.fracao) +
          ' da quantidade contratada consumida na vigência (' + formatarInteiro_(s.consumido) + ' de ' +
          formatarInteiro_(s.contratado) + ').'
      });
    }
  });

  // 2. ANS não cumprido
  dados.competencias.forEach(function (c) {
    if (c.ansCumprido === false) {
      alertas.push({
        tipo: 'ans', nivel: 'critico', competencia: c.competencia,
        texto: 'ANS não cumprido em ' + rotuloCompetencia_(c.competencia) + ': ' + c.ansMinutos +
          ' minutos de indisponibilidade. Registrar ocorrência e avisar o gestor.'
      });
    }
  });

  // 3. Meses encerrados da vigência ainda não lançados
  const ultimoMes = dados.vigencia.fim.slice(0, 7);
  for (let comp = dados.vigencia.inicio.slice(0, 7); comp <= ultimoMes; comp = proximoMes_(comp)) {
    if (lancadas[comp]) continue;
    const inicioProcesso = primeiroDiaUtilDoMes_(proximoMes_(comp), feriados);
    if (dados.hoje < inicioProcesso) break;
    alertas.push({
      tipo: 'nao_lancada', nivel: 'alerta', competencia: comp,
      texto: 'Competência ' + rotuloCompetencia_(comp) + ' ainda não lançada (o processo começou em ' +
        dataBr_(inicioProcesso) + ').'
    });
  }

  // 4. IDs do SEI incompletos depois do prazo
  dados.competencias.forEach(function (c) {
    if (c.idsPreenchidos >= CAMPOS_IDS_SEI.length) return;
    const prazo = prazoIdsSei_(c.competencia, feriados);
    if (dados.hoje <= prazo) return;
    alertas.push({
      tipo: 'ids_sei', nivel: 'alerta', competencia: c.competencia,
      texto: 'Competência ' + rotuloCompetencia_(c.competencia) + ' sem os 4 IDs do SEI (faltam: ' +
        c.idsFaltando.join(', ') + '). O prazo de ' + PRAZO_IDS_SEI_DIAS_UTEIS + ' dias úteis terminou em ' +
        dataBr_(prazo) + '.'
    });
  });

  return alertas;
}

/** Último dia útil do prazo: o 1º dia útil do mês seguinte conta como o dia 1. */
function prazoIdsSei_(comp, feriados) {
  return somarDiasUteis_(primeiroDiaUtilDoMes_(proximoMes_(comp), feriados), PRAZO_IDS_SEI_DIAS_UTEIS - 1, feriados);
}

function primeiroDiaUtilDoMes_(comp, feriados) {
  let dia = comp + '-01';
  while (!ehDiaUtil_(dia, feriados)) dia = somarDias_(dia, 1);
  return dia;
}

/** Avança `n` dias úteis a partir de `dia` (que deve ser útil). */
function somarDiasUteis_(dia, n, feriados) {
  let atual = dia;
  let contados = 0;
  while (contados < n) {
    atual = somarDias_(atual, 1);
    if (ehDiaUtil_(atual, feriados)) contados++;
  }
  return atual;
}

function ehDiaUtil_(dia, feriados) {
  const semana = new Date(dia + 'T00:00:00Z').getUTCDay();
  return semana !== 0 && semana !== 6 && !feriados[dia];
}

function somarDias_(dia, n) {
  const d = new Date(dia + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function proximoMes_(comp) {
  const ano = Number(comp.slice(0, 4));
  const mes = Number(comp.slice(5));
  return mes === 12 ? (ano + 1) + '-01' : ano + '-' + ('0' + (mes + 1)).slice(-2);
}

function dataBr_(dia) {
  return dia.slice(8, 10) + '/' + dia.slice(5, 7) + '/' + dia.slice(0, 4);
}
