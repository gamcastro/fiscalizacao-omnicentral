/**
 * LeituraPdf.js – Fase 5C: leitura dos PDFs da pasta do mês (relatório de itens e de ANS).
 * O Apps Script não lê PDF diretamente: cada PDF é convertido num Google Docs temporário
 * (criado pelo app e apagado logo em seguida) para extrair o texto.
 * Etapa atual: diagnóstico. A leitura no lançamento vem depois de validar o texto real.
 */

const PADRAO_PDF_ITENS = /^relatorio_itens_omni_/i;
const PADRAO_PDF_ANS = /^relatorio_ans_/i;

/** Id da pasta a partir do link do Drive (…/folders/<id>). */
function idPastaDoLink_(link) {
  const m = String(link || '').match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('Link da pasta do Drive inválido. Use o link de uma pasta (…/drive/folders/…).');
  return m[1];
}

/** PDFs de itens e de ANS da pasta. Se houver mais de um, prefere o que tem o mês da competência no nome. */
function localizarPdfs_(idPasta, comp) {
  const mes = NOMES_MESES_PT[Number(comp.slice(5)) - 1];
  const encontrados = { itens: [], ans: [] };
  const arquivos = DriveApp.getFolderById(idPasta).getFiles();
  while (arquivos.hasNext()) {
    const f = arquivos.next();
    if (f.getMimeType() !== MimeType.PDF) continue;
    const nome = f.getName();
    if (PADRAO_PDF_ITENS.test(nome)) encontrados.itens.push(f);
    else if (PADRAO_PDF_ANS.test(nome)) encontrados.ans.push(f);
  }
  const escolher = function (lista) {
    if (!lista.length) return null;
    const doMes = lista.filter(function (f) { return normalizarNomeFonte_(f.getName()).indexOf(mes) >= 0; });
    return (doMes.length ? doMes : lista)[0];
  };
  return { itens: escolher(encontrados.itens), ans: escolher(encontrados.ans) };
}

const NOMES_MESES_PT = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];

/** Converte o PDF num Google Docs temporário, lê o texto e apaga o temporário. */
function textoDoPdf_(arquivo) {
  const temporario = Drive.Files.create(
    { name: 'tmp-fiscalizacao-' + arquivo.getName(), mimeType: MimeType.GOOGLE_DOCS },
    arquivo.getBlob()
  );
  try {
    return DocumentApp.openById(temporario.id).getBody().getText();
  } finally {
    try { Drive.Files.remove(temporario.id); } catch (e) { console.warn('Não apagou o temporário ' + temporario.id + ': ' + e.message); }
  }
}

/* ---------- Leitura chamada pelo lançamento ---------- */

/**
 * Fiscal técnico: lê os PDFs da pasta e devolve SUGESTÕES para o lançamento (nada é gravado).
 * Retorno: { arquivos, itens: { 2: {valor, trecho}, 4: {...} }, fontes: [...], ans: {uptime, trecho}, avisos: [] }
 */
function lerPdfsDaPasta(competencia, linkPasta) {
  requirePerfil_([PERFIS.FISCAL_TECNICO]);
  const comp = validarFormatoCompetencia_(competencia);
  const pdfs = localizarPdfs_(idPastaDoLink_(linkPasta), comp);
  const resultado = { arquivos: {}, itens: {}, fontes: [], ans: null, avisos: [] };

  if (pdfs.itens) {
    resultado.arquivos.itens = pdfs.itens.getName();
    const itens = interpretarTextoItens_(textoDoPdf_(pdfs.itens), comp, listarFontesCatalogo_());
    resultado.itens = itens.itens;
    resultado.fontes = itens.fontes;
    resultado.avisos = resultado.avisos.concat(itens.avisos);
  } else {
    resultado.avisos.push('PDF de itens (relatorio_itens_omni_…) não encontrado na pasta.');
  }
  if (pdfs.ans) {
    resultado.arquivos.ans = pdfs.ans.getName();
    const ans = interpretarTextoAns_(textoDoPdf_(pdfs.ans), comp);
    resultado.ans = ans.ans;
    resultado.avisos = resultado.avisos.concat(ans.avisos);
  } else {
    resultado.avisos.push('PDF do ANS (relatorio_ans_…) não encontrado na pasta.');
  }
  return resultado;
}

/* ---------- Interpretação do texto (sem dependência do Apps Script; testável) ---------- */

const MESES_ABREV_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

/** "35.529" → 35529 (separador de milhar com ponto). */
function inteiroPdf_(texto) {
  return Number(String(texto).replace(/\./g, ''));
}

/** Trecho curto ao redor da posição, para o usuário conferir de onde veio o número. */
function trechoPdf_(texto, inicio, fim) {
  return texto.slice(Math.max(0, inicio), Math.min(texto.length, fim)).replace(/\s+/g, ' ').trim();
}

/**
 * Divide o PDF consolidado em seções, uma por relatório ("Relatório de …").
 * Cada seção: { titulo, texto }.
 */
function secoesRelatorio_(texto) {
  const marcas = [];
  const re = /Relatório de [^\n]*?(?=\s+Período|\s*\n|\s{2,}|$)/g;
  let m;
  while ((m = re.exec(texto)) !== null) marcas.push({ titulo: m[0].trim(), inicio: m.index });
  return marcas.map(function (marca, i) {
    const fim = i + 1 < marcas.length ? marcas[i + 1].inicio : texto.length;
    return { titulo: marca.titulo, texto: texto.slice(marca.inicio, fim) };
  });
}

/** Confere se o período da seção é o mês inteiro da competência. */
function periodoConfere_(textoSecao, comp) {
  const m = textoSecao.match(/(\d{1,2}) de (\w{3})\.? de (\d{4})\s*-\s*(\d{1,2}) de (\w{3})\.? de (\d{4})/);
  if (!m) return { ok: false, texto: 'período não encontrado' };
  const mes = MESES_ABREV_PT[Number(comp.slice(5)) - 1];
  const ultimoDia = String(new Date(Number(comp.slice(0, 4)), Number(comp.slice(5)), 0).getDate());
  const ok = m[1] === '1' && m[2].toLowerCase() === mes && m[3] === comp.slice(0, 4) &&
    m[4] === ultimoDia && m[5].toLowerCase() === mes && m[6] === comp.slice(0, 4);
  return { ok: ok, texto: m[0] };
}

/**
 * Interpreta o PDF consolidado de itens (logins, fontes de mensagens ativas, mensagens passivas).
 * catalogo: listarFontesCatalogo_() – usado para ligar cada seção a uma fonte do item 5.
 */
function interpretarTextoItens_(texto, comp, catalogo) {
  const resultado = { itens: {}, fontes: [], avisos: [] };
  const secoes = secoesRelatorio_(texto);
  if (!secoes.length) {
    resultado.avisos.push('Nenhum relatório reconhecido no PDF de itens.');
    return resultado;
  }
  const porNome = {};
  catalogo.filter(function (f) { return f.item === ITEM_COM_FONTES; }).forEach(function (f) {
    porNome[normalizarNomeFonte_(f.nome)] = f;
    if (f.tituloInterno) porNome[normalizarNomeFonte_(f.tituloInterno)] = f;
  });

  secoes.forEach(function (s) {
    const periodo = periodoConfere_(s.texto, comp);
    if (!periodo.ok) resultado.avisos.push('"' + s.titulo + '": o período do relatório (' + periodo.texto + ') não é o mês da competência.');
    const tituloNorm = normalizarNomeFonte_(s.titulo);

    if (/logins/.test(tituloNorm)) {
      const m = s.texto.match(/Total de logins únicos no\s+período\s+E-mail\s+([\d.]+)/);
      const emails = (s.texto.match(/\d+\.\s+[^\s@]+@[^\s]+/g) || []).length;
      if (!m) { resultado.avisos.push('Logins: total de logins únicos não encontrado.'); return; }
      const valor = inteiroPdf_(m[1]);
      if (emails && emails !== valor) {
        resultado.avisos.push('Logins: o total (' + valor + ') difere do número de e-mails listados (' + emails + '). Confira a paginação do relatório.');
      }
      resultado.itens[2] = { valor: valor, trecho: trechoPdf_(s.texto, m.index, m.index + m[0].length) };
      return;
    }

    if (/passivas/.test(tituloNorm)) {
      const m = s.texto.match(/Atendimentos\s+([\d.]+)/) || s.texto.match(/Total geral\s+([\d.]+)/);
      if (!m) { resultado.avisos.push('Mensagens passivas: total de atendimentos não encontrado.'); return; }
      resultado.itens[4] = { valor: inteiroPdf_(m[1]), trecho: trechoPdf_(s.texto, m.index, m.index + m[0].length) };
      return;
    }

    // Qualquer outra seção é uma fonte de mensagens ativas/template do item 5.
    const m = s.texto.match(/Total de mensagens(?:\s+enviadas)?(?:\s+no período selecionado)?\s+(?:Enviadas\s+)?([\d.]+)/) ||
      s.texto.match(/Total geral\s+([\d.]+)/);
    if (!m) { resultado.avisos.push('"' + s.titulo + '": total de mensagens não encontrado.'); return; }
    const cat = porNome[tituloNorm];
    const fonte = {
      fonteId: cat ? cat.id : '',
      fonteNome: cat ? cat.nome : s.titulo,
      tituloRelatorio: s.titulo,
      quantidadeBruta: inteiroPdf_(m[1]),
      trecho: trechoPdf_(s.texto, m.index, m.index + m[0].length),
      campanhasTeste: []
    };
    if (!cat) resultado.avisos.push('"' + s.titulo + '" não está no catálogo de fontes: entra como "Outro".');
    // Campanhas com "teste" no título (só destaque; a exclusão é decisão do fiscal).
    const reCampanha = /\d+\.\s+(?:\d{1,2} de \w{3}\.? de \d{4}\s+)?(.+?)\s+([\d.]+)(?=\s+\d+\.\s|\s+Total geral|\s*$)/g;
    let c;
    const vistas = {};
    while ((c = reCampanha.exec(s.texto)) !== null) {
      const titulo = c[1].trim();
      if (/teste/i.test(normalizarNomeFonte_(titulo)) && !vistas[titulo]) {
        vistas[titulo] = true;
        fonte.campanhasTeste.push(titulo);
      }
    }
    if (fonte.campanhasTeste.length) {
      resultado.avisos.push('"' + s.titulo + '": campanha(s) com "teste" no nome – ' + fonte.campanhasTeste.join(', ') +
        '. Verifique se devem ser excluídas.');
    }
    resultado.fontes.push(fonte);
  });

  if (!resultado.itens[2]) resultado.avisos.push('Relatório de logins não encontrado no PDF.');
  if (!resultado.itens[4]) resultado.avisos.push('Relatório de mensagens passivas não encontrado no PDF.');
  if (!resultado.fontes.length) resultado.avisos.push('Nenhuma fonte de mensagens ativas encontrada no PDF.');
  return resultado;
}

/** Interpreta o PDF do ANS (Fortics/Statuspage): "October 2026 100%". */
function interpretarTextoAns_(texto, comp) {
  const mes = MESES_EN[Number(comp.slice(5)) - 1];
  const re = new RegExp(mes + '\\s+' + comp.slice(0, 4) + '\\s+([\\d.]+)%');
  const m = texto.match(re);
  if (!m) return { ans: null, avisos: ['ANS: uptime de ' + mes + ' ' + comp.slice(0, 4) + ' não encontrado no PDF.'] };
  return {
    ans: { uptime: Number(m[1]), trecho: trechoPdf_(texto, m.index, m.index + m[0].length) },
    avisos: []
  };
}

/* ---------- Diagnóstico (rodar pelo editor) ---------- */

/**
 * Superadmin: lê os PDFs da pasta e grava o texto extraído num Google Docs
 * "Diagnóstico PDFs <competência>" (na pasta informada), para conferir o formato real.
 */
function diagnosticarPdfs_(linkPasta, competencia) {
  requirePerfil_([PERFIS.SUPERADMIN]);
  const comp = validarFormatoCompetencia_(competencia);
  const idPasta = idPastaDoLink_(linkPasta);
  const pdfs = localizarPdfs_(idPasta, comp);
  const partes = [];
  const resumo = [];

  [['itens', pdfs.itens], ['ans', pdfs.ans]].forEach(function (par) {
    const tipo = par[0];
    const arquivo = par[1];
    if (!arquivo) { resumo.push('PDF de ' + tipo + ': NÃO encontrado na pasta.'); return; }
    const inicio = Date.now();
    const texto = textoDoPdf_(arquivo);
    resumo.push('PDF de ' + tipo + ': ' + arquivo.getName() + ' – ' + texto.length + ' caracteres em ' +
      ((Date.now() - inicio) / 1000).toFixed(1) + ' s.');
    partes.push('===== ' + arquivo.getName() + ' =====\n' + texto);
  });

  const doc = DocumentApp.create('Diagnóstico PDFs ' + comp + ' – ' + Utilities.formatDate(new Date(), FUSO, 'dd/MM/yyyy HH:mm'));
  doc.getBody().setText(partes.join('\n\n') || '(nenhum PDF encontrado)');
  doc.saveAndClose();
  resumo.push('Texto extraído salvo no seu Meu Drive: ' + doc.getUrl());
  console.log(resumo.join('\n'));
  return resumo;
}

/** Atalho para o editor: PDFs de amostra de outubro/2026 na pasta de homologação. */
function diagnosticarPdfsAmostras() {
  return diagnosticarPdfs_('https://drive.google.com/drive/folders/1vwoOgHL0oWSRTcoCli2Hvhduz8tM_WDV', '2026-10');
}
