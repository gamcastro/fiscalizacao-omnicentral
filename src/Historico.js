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
