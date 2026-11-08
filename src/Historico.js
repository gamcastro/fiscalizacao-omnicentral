/**
 * Historico.js – carga das competências anteriores ao app (SPEC, seção 3.10).
 * Rodar uma vez pelo editor, com a conta do superadmin. Competências que já
 * existem são ignoradas. 2026-07 não entra: os dados ainda serão informados.
 */

const HISTORICO_INICIAL = [
  {
    competencia: '2026-08',
    status: 'ENVIADA_COGECON',
    ansUptimePct: 100,
    idRelConsumo: '2866941',
    idRelANS: '2866943',
    idAtesto: '2866955',
    idDespacho: '2866960',
    dataEnvioCogecon: new Date(2026, 8, 3),
    pastaDrive: 'https://drive.google.com/drive/folders/1XL0P-nDABdkCW92OJlpQrp_pzQQRM_HU',
    medicoes: [
      { item: 1, quantidade: 1 },
      { item: 2, quantidade: 6 },
      { item: 3, quantidade: 1 },
      { item: 4, quantidade: 33317 },
      { item: 5, quantidade: 69070 }
    ]
  },
  {
    competencia: '2026-09',
    status: 'EM_CONFERENCIA',
    ansUptimePct: 99.97,
    pastaDrive: 'https://drive.google.com/drive/folders/1B9ddQf2hvl7WE90zeb039G5S2DCCuAda',
    medicoes: [
      { item: 1, quantidade: 1 },
      { item: 2, quantidade: 7 },
      { item: 3, quantidade: 1 },
      { item: 4, quantidade: 6360 },
      {
        item: 5, quantidade: 5213, quantidadeRelatorio: 5215,
        ajusteObs: 'Excluídas 2 mensagens da campanha "Teste Mudança Sessão".'
      }
    ]
  }
];

/**
 * Detalhe do item 5 por fonte das competências já lançadas (SPEC 3.10).
 * 2026-10 não está aqui: não foi lançada antes da Fase 6 e será lançada já com as fontes.
 */
const FONTES_HISTORICO = [
  { competencia: '2026-08', fontes: [{ fonteId: 'F-ENVIO-LOTE', quantidadeBruta: 69070, exclusoes: 0, exclusoesObs: '' }] },
  {
    competencia: '2026-09',
    fontes: [{ fonteId: 'F-ENVIO-LOTE', quantidadeBruta: 5215, exclusoes: 2, exclusoesObs: 'campanha Teste Mudança Sessão' }]
  }
];

/**
 * Rodar uma vez pelo editor (superadmin), depois do setup() da Fase 6.
 * Só grava se a competência existir, ainda não tiver fontes e o total bater com a aba Medicoes.
 * Não altera Medicoes nem o status (vale também para competências já enviadas).
 */
function carregarFontesHistorico() {
  const autor = requirePerfil_([PERFIS.SUPERADMIN]);
  const resumo = comLock_(function () {
    const resumo = [];
    const logs = [];
    const catalogo = {};
    listarFontesCatalogo_().forEach(function (f) { catalogo[f.id] = f; });
    const agora = new Date();

    FONTES_HISTORICO.forEach(function (h) {
      const comp = h.competencia;
      if (!buscarCompetencia_(comp)) { resumo.push(comp + ': competência não existe, nada incluído.'); return; }
      if (fontesDaCompetencia_(comp).length) { resumo.push(comp + ': já tinha fontes, nada incluído.'); return; }
      const faltando = h.fontes.filter(function (f) { return !catalogo[f.fonteId]; });
      if (faltando.length) { resumo.push(comp + ': ATENÇÃO, fonte fora do catálogo (rode setup()). Nada incluído.'); return; }

      const linhas = h.fontes.map(function (f) {
        return {
          competencia: comp, item: ITEM_COM_FONTES, fonteId: f.fonteId, fonteNome: catalogo[f.fonteId].nome,
          quantidadeBruta: f.quantidadeBruta, exclusoes: f.exclusoes, exclusoesObs: f.exclusoesObs,
          quantidadeConsiderada: f.quantidadeBruta - f.exclusoes,
          criadoEm: agora, criadoPor: autor.email, atualizadoEm: agora, atualizadoPor: autor.email
        };
      });
      const total = linhas.reduce(function (s, l) { return s + l.quantidadeConsiderada; }, 0);
      const medicao = medicoesDa_(comp).find(function (m) { return Number(m.item) === ITEM_COM_FONTES; });
      if (!medicao || Number(medicao.quantidade) !== total) {
        resumo.push(comp + ': ATENÇÃO, o total das fontes (' + formatarInteiro_(total) + ') não bate com o item 5 lançado (' +
          (medicao ? formatarInteiro_(Number(medicao.quantidade)) : 'sem item 5') + '). Nada incluído.');
        return;
      }
      incluir_(ABAS.MED_FONTES, linhas);
      linhas.forEach(function (l) {
        logs.push(montarLog_('CRIAR', ABAS.MED_FONTES, comp + '/' + ITEM_COM_FONTES + '/' + l.fonteId, null, l));
      });
      resumo.push(comp + ': ' + linhas.length + ' fonte(s) incluída(s), total ' + formatarInteiro_(total) + '.');
    });

    incluir_(ABAS.LOG, logs);
    resumo.push('Log: ' + logs.length + ' registro(s) gravado(s).');
    return resumo;
  });
  console.log(resumo.join('\n'));
  return resumo;
}

function carregarHistorico() {
  const autor = requirePerfil_([PERFIS.SUPERADMIN]);
  const resumo = comLock_(function () {
    const resumo = [];
    const logs = [];
    const limiteAns = numeroConfig_(lerConfig_(), 'ANS_LIMITE_MIN');
    const agora = new Date();
    const carimbo = { criadoEm: agora, criadoPor: autor.email, atualizadoEm: agora, atualizadoPor: autor.email };

    HISTORICO_INICIAL.forEach(function (h) {
      const comp = h.competencia;
      if (buscarCompetencia_(comp)) {
        resumo.push(comp + ': já existia, nada incluído.');
        return;
      }
      const vigencia = vigenciaDaCompetencia_(comp);
      if (!vigencia) {
        resumo.push(comp + ': ATENÇÃO, fora de qualquer vigência cadastrada. Nada incluído.');
        return;
      }

      const minutos = calcularMinutosAns_(h.ansUptimePct, comp);
      const competencia = Object.assign({
        competencia: comp,
        vigencia: vigencia.id,
        status: h.status,
        ansUptimePct: h.ansUptimePct,
        ansMinutos: minutos,
        ansCumprido: minutos <= limiteAns,
        ansObs: '',
        idRelConsumo: h.idRelConsumo || '',
        idRelANS: h.idRelANS || '',
        idAtesto: h.idAtesto || '',
        idDespacho: h.idDespacho || '',
        dataEnvioCogecon: h.dataEnvioCogecon || '',
        pastaDrive: h.pastaDrive || '',
        obs: 'Carga inicial do histórico (SPEC 3.10).'
      }, carimbo);
      incluir_(ABAS.COMPETENCIAS, [competencia]);
      logs.push(montarLog_('CRIAR', ABAS.COMPETENCIAS, comp, null, competencia));

      const medicoes = h.medicoes.map(function (m) {
        return Object.assign({
          competencia: comp,
          item: m.item,
          quantidade: m.quantidade,
          quantidadeRelatorio: m.quantidadeRelatorio !== undefined ? m.quantidadeRelatorio : m.quantidade,
          ajusteObs: m.ajusteObs || ''
        }, carimbo);
      });
      incluir_(ABAS.MEDICOES, medicoes);
      medicoes.forEach(function (m) {
        logs.push(montarLog_('CRIAR', ABAS.MEDICOES, comp + '/' + m.item, null, m));
      });

      resumo.push(comp + ': incluída (' + h.status + ', ANS ' + minutos + ' min, ' + medicoes.length + ' itens).');
    });

    incluir_(ABAS.LOG, logs);
    resumo.push('Log: ' + logs.length + ' registro(s) gravado(s).');
    return resumo;
  });

  console.log(resumo.join('\n'));
  return resumo;
}
