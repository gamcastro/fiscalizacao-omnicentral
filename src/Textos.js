/**
 * Textos.js – atesto e despacho para o SEI (SPEC, seção 6).
 * Gera cada texto em HTML (para colar no editor do SEI) e em texto simples.
 * Nenhum valor em reais entra nos textos.
 */

const MARCADORES_ID_SEI = {
  idRelConsumo: '[ID do Relatório de Consumo de Itens]',
  idRelANS: '[ID do Relatório de Cumprimento do ANS]',
  idAtesto: '[ID do Atesto]'
};

/**
 * registro: linha da aba Competencias; medicoes: [{ item, quantidade }];
 * itens: listarItens_(); config: lerConfig_().
 * Retorna { atesto: { texto, html }, despacho: { texto, html }, avisos: [] }.
 */
function gerarTextosSei_(registro, medicoes, itens, config) {
  const comp = textoCompetencia_(registro.competencia);
  const ano = comp.slice(0, 4);
  const mes = comp.slice(5, 7);
  const dataInicio = '01/' + mes + '/' + ano;
  const dataFim = ('0' + diasNoMes_(comp)).slice(-2) + '/' + mes + '/' + ano;
  const contrato = String(config.CONTRATO || '20/2025');
  const assinatura = String(config.FISCAL_TECNICO_ASSINATURA || '');
  const avisos = [];

  const ids = {};
  Object.keys(MARCADORES_ID_SEI).forEach(function (campo) {
    const valor = String(registro[campo] || '').trim();
    ids[campo] = valor || MARCADORES_ID_SEI[campo];
    if (!valor) avisos.push('Falta o ' + MARCADORES_ID_SEI[campo].slice(1, -1) + ': o texto mostra um marcador no lugar.');
  });

  // Tabela: itens fixos e de consumo sempre; eventuais só com quantidade > 0
  const porItem = {};
  medicoes.forEach(function (m) { porItem[Number(m.item)] = m; });
  const linhas = [];
  itens.forEach(function (it) {
    const m = porItem[it.item];
    const quantidade = m && m.quantidade !== null && m.quantidade !== '' ? Number(m.quantidade) : null;
    if (it.tipo === 'EVENTUAL' && !(quantidade > 0)) return;
    if (quantidade === null) avisos.push('Item ' + it.item + ' sem quantidade lançada.');
    linhas.push({
      item: String(it.item),
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: quantidade === null ? '[não lançado]' : formatarInteiro_(quantidade)
    });
  });

  // Frase do ANS
  const ansCumprido = registro.ansCumprido === '' ? null : ehVerdadeiro_(registro.ansCumprido);
  let fraseAns;
  if (ansCumprido === false) {
    fraseAns = 'Registra-se que o ANS não foi integralmente atendido no período, com ' + registro.ansMinutos +
      ' minutos de indisponibilidade, conforme relatório (ID ' + ids.idRelANS + '), conforme ocorrência registrada.';
  } else {
    if (ansCumprido === null) avisos.push('O ANS desta competência não foi informado.');
    fraseAns = 'Os serviços foram executados em conformidade com as especificações técnicas, atendendo integralmente ao ANS, ' +
      'conforme relatório (ID ' + ids.idRelANS + '), não havendo quaisquer ressalvas quanto à execução no período atestado.';
  }

  const aberturaAtesto = 'Atesto, para os devidos fins, que a empresa ' + String(config.EMPRESA || '').toUpperCase() +
    ', inscrita no CNPJ sob o nº ' + String(config.CNPJ || '') + ', executou de forma satisfatória, no período de ' +
    dataInicio + ' a ' + dataFim + ', os serviços contratados relativos ao ' + String(config.OBJETO_ATESTO || '') + '.';
  const rodapeAtesto = 'Fiscal Técnico Contrato ' + contrato;

  const cabecalhoTabela = ['Item', 'Descrição', 'Unidade de Medida', 'Quantidade'];
  const atestoTexto = [
    'ATESTO',
    aberturaAtesto,
    'Segue discriminação:',
    cabecalhoTabela.join('\t')
  ].concat(linhas.map(function (l) { return [l.item, l.descricao, l.unidade, l.quantidade].join('\t'); }))
    .concat([fraseAns, assinatura, rodapeAtesto])
    .join('\n');

  const celula = 'border:1px solid #000;padding:4px 6px;';
  const atestoHtml =
    '<p style="text-align:center"><b>ATESTO</b></p>' +
    '<p style="text-align:justify">' + escaparHtml_(aberturaAtesto) + '</p>' +
    '<p>Segue discriminação:</p>' +
    '<table style="border-collapse:collapse;width:100%">' +
      '<tr>' + cabecalhoTabela.map(function (h) {
        return '<th style="' + celula + 'background:#eee">' + escaparHtml_(h) + '</th>';
      }).join('') + '</tr>' +
      linhas.map(function (l) {
        return '<tr>' +
          '<td style="' + celula + 'text-align:center">' + escaparHtml_(l.item) + '</td>' +
          '<td style="' + celula + '">' + escaparHtml_(l.descricao) + '</td>' +
          '<td style="' + celula + '">' + escaparHtml_(l.unidade) + '</td>' +
          '<td style="' + celula + 'text-align:right">' + escaparHtml_(l.quantidade) + '</td>' +
        '</tr>';
      }).join('') +
    '</table>' +
    '<p style="text-align:justify">' + escaparHtml_(fraseAns) + '</p>' +
    '<p style="text-align:center">' + escaparHtml_(assinatura) + '<br>' + escaparHtml_(rodapeAtesto) + '</p>';

  const despachoParagrafos = [
    'À COGECON,',
    'Encaminho o processo para prosseguimento da análise e pagamento referente ao Contrato nº ' + contrato +
      ' (OMNICENTRAL), para a competência de ' + dataInicio + ' a ' + dataFim + '.',
    'Para este fim, foram incluídos os Relatórios de Fiscalização e o Atesto de Recebimento de Serviços, conforme identificadores abaixo:'
  ];
  const despachoMarcadores = [
    'Relatórios de Fiscalização: id ' + ids.idRelConsumo + ' e ' + ids.idRelANS + '.',
    'Atesto de Recebimento dos Serviços: id ' + ids.idAtesto + '.'
  ];
  const rodapeDespacho = 'Fiscal Técnico do Contrato ' + contrato;

  const despachoTexto = despachoParagrafos
    .concat(despachoMarcadores.map(function (m) { return '• ' + m; }))
    .concat([assinatura, rodapeDespacho])
    .join('\n');
  const despachoHtml =
    despachoParagrafos.map(function (p) { return '<p style="text-align:justify">' + escaparHtml_(p) + '</p>'; }).join('') +
    '<ul>' + despachoMarcadores.map(function (m) { return '<li>' + escaparHtml_(m) + '</li>'; }).join('') + '</ul>' +
    '<p style="text-align:center">' + escaparHtml_(assinatura) + '<br>' + escaparHtml_(rodapeDespacho) + '</p>';

  return {
    atesto: { texto: atestoTexto, html: atestoHtml },
    despacho: { texto: despachoTexto, html: despachoHtml },
    avisos: avisos
  };
}

function escaparHtml_(texto) {
  return String(texto === undefined || texto === null ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
