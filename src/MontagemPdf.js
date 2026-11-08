/**
 * MontagemPdf.js – v0.10.0: montagem dos relatórios do mês a partir dos PDFs baixados.
 *
 * Fluxo: o fiscal escolhe no navegador os PDFs baixados (um por relatório do SZ.chat e o da Fortics).
 * Cada arquivo vem para cá só para ser IDENTIFICADO (título e período). O texto é extraído num
 * Google Docs temporário, apagado em seguida; o PDF não é guardado no Drive.
 * A junção (relatorio_itens_omni_…) é feita no navegador e baixada no computador do fiscal.
 * Nada é gravado na planilha: os valores voltam como sugestão para o lançamento.
 */

const TAMANHO_MAX_PDF_MB = 20;

/** Ordem dos relatórios no PDF consolidado de itens (SPEC 1.2): logins → mensagens ativas → mensagens passivas. */
const ORDEM_TIPO_PDF = { logins: 1, ativas: 2, consolidado: 2, passivas: 3, desconhecido: 8, fora: 9 };
const ROTULO_TIPO_PDF = {
  logins: 'Item 2 – logins',
  ativas: 'Item 5 – mensagens ativas',
  passivas: 'Item 4 – mensagens passivas',
  consolidado: 'PDF já consolidado (vários relatórios)',
  ans: 'ANS (Fortics)',
  fora: 'Fora do contrato',
  desconhecido: 'Não reconhecido'
};

/**
 * Fiscal técnico: identifica um PDF enviado pelo navegador (base64). Nada é gravado.
 * Retorno: { tipo, rotuloTipo, titulo, periodoTexto, periodoOk, ordem, aviso, texto }
 */
function identificarPdf(competencia, nome, base64) {
  requirePerfil_([PERFIS.FISCAL_TECNICO]);
  const comp = validarFormatoCompetencia_(competencia);
  const nomeArquivo = String(nome || 'arquivo.pdf').slice(0, 200);
  let bytes;
  try {
    bytes = Utilities.base64Decode(String(base64 || ''));
  } catch (e) {
    throw new Error('Não foi possível ler o arquivo "' + nomeArquivo + '".');
  }
  if (!bytes.length) throw new Error('O arquivo "' + nomeArquivo + '" está vazio.');
  if (bytes.length > TAMANHO_MAX_PDF_MB * 1024 * 1024) {
    throw new Error('O arquivo "' + nomeArquivo + '" passa de ' + TAMANHO_MAX_PDF_MB + ' MB.');
  }
  // Todo PDF começa com "%PDF".
  if (bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70) {
    throw new Error('O arquivo "' + nomeArquivo + '" não é um PDF.');
  }
  const texto = textoDoBlob_(Utilities.newBlob(bytes, MimeType.PDF, nomeArquivo), nomeArquivo);
  const r = classificarTextoPdf_(texto, comp, listarFontesCatalogo_());
  r.texto = texto;
  return r;
}

/**
 * Fiscal técnico: interpreta os textos dos PDFs escolhidos (na ordem da montagem) e devolve
 * as sugestões no mesmo formato de lerPdfsDaPasta. Nada é gravado.
 */
function interpretarPdfsMontados(competencia, textosItens, textoAns) {
  requirePerfil_([PERFIS.FISCAL_TECNICO]);
  const comp = validarFormatoCompetencia_(competencia);
  const resultado = { arquivos: {}, itens: {}, fontes: [], ans: null, avisos: [], nomes: nomesPdfsMontados_(comp) };
  const lista = (textosItens || []).map(String).filter(function (t) { return t.trim(); });
  if (lista.length) {
    const itens = interpretarTextoItens_(lista, comp, listarFontesCatalogo_());
    resultado.itens = itens.itens;
    resultado.fontes = itens.fontes;
    resultado.avisos = resultado.avisos.concat(itens.avisos);
  } else {
    resultado.avisos.push('Nenhum relatório de itens foi incluído na montagem.');
  }
  if (textoAns && String(textoAns).trim()) {
    const ans = interpretarTextoAns_(String(textoAns), comp);
    resultado.ans = ans.ans;
    resultado.avisos = resultado.avisos.concat(ans.avisos);
  } else {
    resultado.avisos.push('PDF do ANS não incluído: informe o uptime à mão.');
  }
  return resultado;
}

/* ---------- Classificação (sem dependência do Apps Script; testável) ---------- */

/** PDF da Fortics/Statuspage: tem "Uptime" e linhas "October 2026 99.90%". */
function ehPdfAns_(texto) {
  const meses = MESES_EN.join('|');
  return /uptime/i.test(texto) && new RegExp('(' + meses + ')\\s+\\d{4}\\s+[\\d.]+%').test(texto);
}

function classificarTextoPdf_(texto, comp, catalogo) {
  if (ehPdfAns_(texto)) {
    const ans = interpretarTextoAns_(texto, comp);
    const meses = texto.match(new RegExp('(' + MESES_EN.join('|') + ')\\s+\\d{4}(?=\\s+[\\d.]+%)', 'g')) || [];
    return {
      tipo: 'ans',
      rotuloTipo: ROTULO_TIPO_PDF.ans,
      titulo: 'Uptime (Fortics)',
      periodoTexto: meses.join(', '),
      periodoOk: !!ans.ans,
      ordem: 0,
      aviso: ans.ans ? '' : 'O mês da competência não aparece neste PDF do ANS.'
    };
  }

  const secoes = secoesRelatorio_(texto, catalogo);
  if (!secoes.length) {
    return {
      tipo: 'desconhecido', rotuloTipo: ROTULO_TIPO_PDF.desconhecido, titulo: '', periodoTexto: '',
      periodoOk: false, ordem: ORDEM_TIPO_PDF.desconhecido,
      aviso: 'Nenhum relatório do SZ.chat nem da Fortics reconhecido neste arquivo.'
    };
  }

  const titulos = secoes.map(function (s) { return s.titulo; });
  const periodos = secoes.map(function (s) { return periodoConfere_(s.texto, comp); });
  const periodoOk = periodos.every(function (p) { return p.ok; });
  const periodoTexto = periodos.map(function (p) { return p.texto; })
    .filter(function (t, i, a) { return a.indexOf(t) === i; }).join('; ');
  const avisoPeriodo = periodoOk ? '' : 'Período diferente do mês da competência ' + rotuloCompetencia_(comp) + '.';

  if (secoes.length > 1) {
    return {
      tipo: 'consolidado', rotuloTipo: ROTULO_TIPO_PDF.consolidado, titulo: titulos.join(' · '),
      periodoTexto: periodoTexto, periodoOk: periodoOk, ordem: ORDEM_TIPO_PDF.consolidado,
      aviso: ['Este arquivo já junta ' + secoes.length + ' relatórios. Confira se não há relatório repetido.', avisoPeriodo]
        .filter(Boolean).join(' ')
    };
  }

  const titulo = titulos[0];
  const norm = normalizarNomeFonte_(titulo);
  let tipo = tipoDaSecao_(secoes[0]);
  if (tipo === 'convocacao') tipo = 'fora';

  let ordem = ORDEM_TIPO_PDF[tipo];
  if (tipo === 'ativas') {
    // Entre as fontes do item 5, segue a ordem do catálogo; fonte desconhecida vai por último.
    const fontes = catalogo.filter(function (f) { return f.item === ITEM_COM_FONTES; });
    const pos = fontes.findIndex(function (f) {
      return normalizarNomeFonte_(f.nome) === norm || (f.tituloInterno && normalizarNomeFonte_(f.tituloInterno) === norm);
    });
    ordem += (pos >= 0 ? pos + 1 : 99) / 100;
  }
  const avisos = [];
  if (tipo === 'fora') avisos.push('O Relatório de convocação não faz parte do contrato.');
  if (avisoPeriodo) avisos.push(avisoPeriodo);
  return {
    tipo: tipo, rotuloTipo: ROTULO_TIPO_PDF[tipo], titulo: titulo, periodoTexto: periodoTexto,
    periodoOk: periodoOk, ordem: ordem, aviso: avisos.join(' ')
  };
}

/** Nome padrão dos PDFs do mês: relatorio_itens_omni_outubro_2026.pdf / relatorio_ans_outubro_2026.pdf. */
function nomesPdfsMontados_(comp) {
  const sufixo = NOMES_MESES_PT[Number(comp.slice(5)) - 1] + '_' + comp.slice(0, 4) + '.pdf';
  return { itens: 'relatorio_itens_omni_' + sufixo, ans: 'relatorio_ans_' + sufixo };
}
