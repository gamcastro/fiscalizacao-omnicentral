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
  try {
    Drive.Files.update({}, doc.getId(), null, { addParents: idPasta, removeParents: 'root', supportsAllDrives: true });
  } catch (e) {
    resumo.push('(O documento ficou no seu Meu Drive: ' + e.message + ')');
  }
  resumo.push('Texto extraído salvo em: ' + doc.getUrl());
  console.log(resumo.join('\n'));
  return resumo;
}

/** Atalho para o editor: PDFs de amostra de outubro/2026 na pasta de homologação. */
function diagnosticarPdfsAmostras() {
  return diagnosticarPdfs_('https://drive.google.com/drive/folders/1vwoOgHL0oWSRTcoCli2Hvhduz8tM_WDV', '2026-10');
}
