/**
 * Feriados.js – carga dos feriados e pontos facultativos na aba Feriados,
 * usada na contagem de dias úteis do painel.
 * Rodar pelo editor, com a conta do superadmin. Datas que já existem são ignoradas.
 */

const FONTE_FERIADOS_2026 = 'Portaria TRE-MA nº 10/2026';

/** [início, fim, motivo]: fim vazio = um dia só. Datas em 'yyyy-MM-dd'. */
const FERIADOS_2026 = [
  ['2026-01-01', '2026-01-06', 'Recesso Forense'],
  ['2026-02-16', '', 'Carnaval'],
  ['2026-02-17', '', 'Carnaval'],
  ['2026-02-18', '', 'Quarta-feira de Cinzas (ponto facultativo)'],
  ['2026-04-01', '2026-04-05', 'Semana Santa'],
  ['2026-04-21', '', 'Dia de Tiradentes'],
  ['2026-05-01', '', 'Dia do Trabalho'],
  ['2026-06-04', '', 'Corpus Christi'],
  ['2026-06-29', '', 'São Pedro (feriado municipal de São Luís, art. 5º)'],
  ['2026-07-28', '', 'Adesão do Maranhão à Independência'],
  ['2026-08-11', '', 'Dia da Instituição dos Cursos Jurídicos no Brasil/Dia do Advogado'],
  ['2026-09-07', '', 'Dia da Independência do Brasil'],
  ['2026-09-08', '', 'Natividade de Nossa Senhora (feriado municipal de São Luís, art. 5º)'],
  ['2026-10-12', '', 'Nossa Senhora Aparecida'],
  ['2026-10-28', '', 'Dia do Servidor Público (ponto facultativo)'],
  ['2026-11-01', '', 'Dia de Todos os Santos'],
  ['2026-11-02', '', 'Dia de Finados'],
  ['2026-11-15', '', 'Proclamação da República'],
  ['2026-11-20', '', 'Dia Nacional de Zumbi e da Consciência Negra'],
  ['2026-12-08', '', 'Dia da Justiça/Nossa Senhora da Conceição'],
  ['2026-12-20', '2026-12-31', 'Recesso Forense']
];

function carregarFeriados2026() {
  return carregarFeriados_(FERIADOS_2026, FONTE_FERIADOS_2026);
}

function carregarFeriados_(periodos, fonte) {
  requirePerfil_([PERFIS.SUPERADMIN]);
  const resumo = comLock_(function () {
    const existentes = {};
    listar_(ABAS.FERIADOS).forEach(function (f) { existentes[dataIso_(f.data)] = true; });

    const novos = [];
    let repetidos = 0;
    periodos.forEach(function (p) {
      const fim = p[1] || p[0];
      for (let dia = p[0]; dia <= fim; dia = somarDias_(dia, 1)) {
        if (existentes[dia]) { repetidos++; continue; }
        existentes[dia] = true;
        novos.push({
          data: new Date(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10))),
          descricao: p[2] + ' – ' + fonte
        });
      }
    });

    incluir_(ABAS.FERIADOS, novos);
    incluir_(ABAS.LOG, novos.map(function (f) {
      return montarLog_('CRIAR', ABAS.FERIADOS, dataIso_(f.data), null, f);
    }));
    return [
      'Feriados: ' + novos.length + ' data(s) incluída(s), ' + repetidos + ' já existia(m).',
      'Log: ' + novos.length + ' registro(s) gravado(s).'
    ];
  });

  console.log(resumo.join('\n'));
  return resumo;
}
