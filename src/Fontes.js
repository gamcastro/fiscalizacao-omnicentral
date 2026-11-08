/**
 * Fontes.js – fontes variáveis do item 5 (Fase 6, SPEC 3.11, 3.12 e regra 8).
 * O item 5 é a soma das quantidades consideradas (bruta − exclusões) de cada fonte do mês.
 * Catálogo em FontesRelatorio (fonte nunca é apagada, só desativada); detalhe em MedicaoFontes.
 * Na aba Medicoes o item 5 continua com uma linha só (total).
 */

const ITEM_COM_FONTES = 5;
const TEXTO_VERIFICACAO_FONTES =
  'Confirmo que verifiquei todos os relatórios de mensagens ativas/template do período em Relatórios Premium';
const TEXTO_SEM_MENSAGENS_ATIVAS = 'Não houve mensagens ativas no período';

/* ---------- Leitura ---------- */

/** Antes do setup() da Fase 6 as abas novas não existem: as leituras devolvem lista vazia. */
function abaFontesExiste_(nome) {
  return !!planilha_().getSheetByName(nome);
}

function listarFontesCatalogo_() {
  if (!abaFontesExiste_(ABAS.FONTES)) return [];
  return listar_(ABAS.FONTES).map(function (f) {
    return {
      id: String(f.id).trim(),
      item: Number(f.item),
      nome: String(f.nome || '').trim(),
      tituloInterno: String(f.tituloInterno || '').trim(),
      ativo: ehVerdadeiro_(f.ativo)
    };
  });
}

/** Linhas de MedicaoFontes do item 5 de uma competência (com _linha). */
function fontesDaCompetencia_(comp) {
  if (!abaFontesExiste_(ABAS.MED_FONTES)) return [];
  return listar_(ABAS.MED_FONTES).filter(function (f) {
    return textoCompetencia_(f.competencia) === comp && Number(f.item) === ITEM_COM_FONTES;
  });
}

function fonteParaCliente_(f) {
  return {
    fonteId: String(f.fonteId || '').trim(),
    fonteNome: String(f.fonteNome || ''),
    quantidadeBruta: numeroOuNulo_(f.quantidadeBruta),
    exclusoes: numeroOuNulo_(f.exclusoes) || 0,
    exclusoesObs: String(f.exclusoesObs || ''),
    quantidadeConsiderada: numeroOuNulo_(f.quantidadeConsiderada)
  };
}

/** Comparação de nomes sem acento, maiúsculas ou espaços extras. */
function normalizarNomeFonte_(nome) {
  return String(nome || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

/** Chave que identifica a fonte numa competência: id do catálogo ou o nome digitado em "Outro". */
function chaveFonte_(fonteId, fonteNome) {
  return fonteId ? fonteId : 'OUTRO:' + normalizarNomeFonte_(fonteNome);
}

/* ---------- Validação e gravação (usadas por salvarCompetencia) ---------- */

/**
 * entrada: [{ fonteId, fonteNome, quantidadeBruta, exclusoes, exclusoesObs }].
 * Linhas totalmente vazias são ignoradas. Retorna as fontes normalizadas.
 */
function validarFontes_(entrada, catalogo) {
  const porId = {};
  const porNome = {};
  catalogo.forEach(function (f) {
    porId[f.id] = f;
    porNome[normalizarNomeFonte_(f.nome)] = f;
    if (f.tituloInterno) porNome[normalizarNomeFonte_(f.tituloInterno)] = f;
  });
  const vazio = function (v) { return v === undefined || v === null || String(v).trim() === ''; };
  const erros = [];
  const vistas = {};
  const fontes = [];

  (Array.isArray(entrada) ? entrada : []).forEach(function (e, i) {
    const rotulo = 'Item 5, fonte ' + (i + 1);
    const fonteId = String(e.fonteId || '').trim();
    const obs = String(e.exclusoesObs || '').trim();
    const semNumeros = vazio(e.quantidadeBruta) && (vazio(e.exclusoes) || String(e.exclusoes).trim() === '0') && !obs;
    let nome;
    if (fonteId) {
      const cat = porId[fonteId];
      if (!cat || cat.item !== ITEM_COM_FONTES) { erros.push(rotulo + ': fonte não encontrada no catálogo.'); return; }
      nome = cat.nome;
    } else {
      nome = String(e.fonteNome || '').trim().replace(/\s+/g, ' ');
      if (!nome) {
        if (!semNumeros) erros.push(rotulo + ': informe o nome da fonte "Outro".');
        return;
      }
    }
    if (semNumeros) return; // linha vazia (ex.: fonte sugerida sem preenchimento)

    const bruta = lerInteiro_(e.quantidadeBruta, rotulo + ' (' + nome + ') – quantidade bruta', erros);
    const exclusoes = lerInteiro_(e.exclusoes, rotulo + ' (' + nome + ') – exclusões', erros);
    if (bruta === undefined || exclusoes === undefined) return;
    if (bruta === null) { erros.push(rotulo + ' (' + nome + '): informe a quantidade bruta.'); return; }
    const excl = exclusoes || 0;
    if (excl > bruta) { erros.push(rotulo + ' (' + nome + '): as exclusões não podem passar da quantidade bruta.'); return; }
    if (excl > 0 && !obs) { erros.push(rotulo + ' (' + nome + '): explique as exclusões na observação.'); return; }
    if (!fonteId && porNome[normalizarNomeFonte_(nome)]) {
      erros.push(rotulo + ': "' + nome + '" já está no catálogo como "' + porNome[normalizarNomeFonte_(nome)].nome + '". Escolha-a na lista.');
      return;
    }
    const chave = chaveFonte_(fonteId, nome);
    if (vistas[chave]) { erros.push('A fonte "' + nome + '" aparece mais de uma vez no item 5.'); return; }
    vistas[chave] = true;
    fontes.push({
      fonteId: fonteId, fonteNome: nome, quantidadeBruta: bruta, exclusoes: excl,
      exclusoesObs: obs, quantidadeConsiderada: bruta - excl
    });
  });

  if (erros.length) throw new Error(erros.join('\n'));
  return fontes;
}

/** Totais do item 5 e o resumo das exclusões para Medicoes.ajusteObs. */
function resumoFontes_(fontes) {
  let total = 0;
  let bruto = 0;
  const exclusoes = [];
  fontes.forEach(function (f) {
    total += f.quantidadeConsiderada;
    bruto += f.quantidadeBruta;
    if (f.exclusoes > 0) exclusoes.push(f.fonteNome + ': excluídas ' + formatarInteiro_(f.exclusoes) + ' (' + f.exclusoesObs + ')');
  });
  return { total: total, bruto: bruto, ajusteObs: exclusoes.join('; ') };
}

/**
 * Sincroniza MedicaoFontes da competência com a lista validada: atualiza, inclui e exclui
 * (exclusão com Log EXCLUIR, permitida enquanto a competência não foi enviada – quem chama garante).
 */
function gravarFontes_(comp, fontes, autor, agora, logs) {
  const atuais = fontesDaCompetencia_(comp);
  const porChave = {};
  atuais.forEach(function (a) { porChave[chaveFonte_(String(a.fonteId || '').trim(), a.fonteNome)] = a; });
  const manter = {};
  const novas = [];

  fontes.forEach(function (f) {
    const chave = chaveFonte_(f.fonteId, f.fonteNome);
    manter[chave] = true;
    const valores = {
      fonteId: f.fonteId, fonteNome: f.fonteNome, quantidadeBruta: f.quantidadeBruta, exclusoes: f.exclusoes,
      exclusoesObs: f.exclusoesObs, quantidadeConsiderada: f.quantidadeConsiderada
    };
    const chaveLog = comp + '/' + ITEM_COM_FONTES + '/' + (f.fonteId || f.fonteNome);
    const atual = porChave[chave];
    if (!atual) {
      const nova = Object.assign({ competencia: comp, item: ITEM_COM_FONTES }, valores, {
        criadoEm: agora, criadoPor: autor.email, atualizadoEm: agora, atualizadoPor: autor.email
      });
      novas.push(nova);
      logs.push(montarLog_('CRIAR', ABAS.MED_FONTES, chaveLog, null, nova));
      return;
    }
    const mudancas = diferencas_(atual, valores);
    if (!Object.keys(mudancas).length) return;
    atualizar_(ABAS.MED_FONTES, atual._linha, Object.assign({}, mudancas, { atualizadoEm: agora, atualizadoPor: autor.email }));
    logs.push(montarLog_('EDITAR', ABAS.MED_FONTES, chaveLog, selecionar_(atual, Object.keys(mudancas)), mudancas));
  });

  const remover = atuais.filter(function (a) { return !manter[chaveFonte_(String(a.fonteId || '').trim(), a.fonteNome)]; });
  remover.forEach(function (a) {
    logs.push(montarLog_('EXCLUIR', ABAS.MED_FONTES, comp + '/' + ITEM_COM_FONTES + '/' + (a.fonteId || a.fonteNome), a, null));
  });
  excluirLinhas_(ABAS.MED_FONTES, remover.map(function (a) { return a._linha; }));
  incluir_(ABAS.MED_FONTES, novas);
}

/* ---------- Catálogo ---------- */

/**
 * Fiscal técnico ou superadmin: inclui no catálogo uma fonte informada como "Outro" e,
 * se `competencia` for informada, liga a ela as linhas "Outro" com o mesmo nome.
 */
function incluirFonteCatalogo(nome, competencia) {
  const autor = requirePerfil_([PERFIS.FISCAL_TECNICO]);
  const nomeLimpo = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!nomeLimpo) throw new Error('Informe o nome da fonte.');
  if (nomeLimpo.length > 120) throw new Error('O nome da fonte deve ter no máximo 120 caracteres.');

  return comLock_(function () {
    const catalogo = listarFontesCatalogo_();
    const repetida = catalogo.find(function (f) {
      return normalizarNomeFonte_(f.nome) === normalizarNomeFonte_(nomeLimpo) ||
        (f.tituloInterno && normalizarNomeFonte_(f.tituloInterno) === normalizarNomeFonte_(nomeLimpo));
    });
    if (repetida) throw new Error('"' + nomeLimpo + '" já está no catálogo como "' + repetida.nome + '".');

    const agora = new Date();
    const nova = {
      id: gerarIdFonte_(nomeLimpo, catalogo), item: ITEM_COM_FONTES, nome: nomeLimpo, tituloInterno: '', ativo: true,
      criadoEm: agora, criadoPor: autor.email, atualizadoEm: agora, atualizadoPor: autor.email
    };
    incluir_(ABAS.FONTES, [nova]);
    const logs = [montarLog_('CRIAR', ABAS.FONTES, nova.id, null, nova)];

    let ligadas = 0;
    const comp = String(competencia || '').trim();
    const registro = comp ? buscarCompetencia_(comp) : null;
    if (registro && registro.status !== STATUS.ENVIADA_COGECON) {
      fontesDaCompetencia_(comp)
        .filter(function (f) { return !String(f.fonteId || '').trim() && normalizarNomeFonte_(f.fonteNome) === normalizarNomeFonte_(nomeLimpo); })
        .forEach(function (f) {
          atualizar_(ABAS.MED_FONTES, f._linha, { fonteId: nova.id, atualizadoEm: agora, atualizadoPor: autor.email });
          logs.push(montarLog_('EDITAR', ABAS.MED_FONTES, comp + '/' + ITEM_COM_FONTES + '/' + nomeLimpo, { fonteId: '' }, { fonteId: nova.id }));
          ligadas++;
        });
    }
    incluir_(ABAS.LOG, logs);
    return { mensagem: 'Fonte "' + nomeLimpo + '" incluída no catálogo' + (ligadas ? ' e ligada à competência.' : '.'), id: nova.id };
  });
}

/** Superadmin (tela de Configurações): cria ou edita fonte do catálogo. dados: { novo, id, item, nome, tituloInterno, ativo } */
function salvarFonteCatalogo(dados) {
  const autor = requirePerfil_([PERFIS.SUPERADMIN]);
  if (!dados || typeof dados !== 'object') throw new Error('Dados da fonte não informados.');
  const nome = String(dados.nome || '').trim().replace(/\s+/g, ' ');
  const titulo = String(dados.tituloInterno || '').trim().replace(/\s+/g, ' ');
  const item = Number(dados.item);
  if (!nome) throw new Error('Informe o nome da fonte, como aparece na lista de Relatórios Premium.');
  if (nome.length > 120 || titulo.length > 120) throw new Error('Nome e título interno devem ter no máximo 120 caracteres.');
  if (!listarItens_().some(function (it) { return it.item === item; })) throw new Error('Escolha um item válido.');

  return comLock_(function () {
    const linhas = listar_(ABAS.FONTES);
    const catalogo = listarFontesCatalogo_();
    const id = String(dados.id || '').trim();
    const existente = dados.novo === true ? null : linhas.find(function (f) { return String(f.id).trim() === id; });
    if (dados.novo !== true && !existente) throw new Error('Fonte ' + id + ' não encontrada.');
    const repetida = catalogo.find(function (f) {
      return f.id !== id && (normalizarNomeFonte_(f.nome) === normalizarNomeFonte_(nome) ||
        (titulo && normalizarNomeFonte_(f.nome) === normalizarNomeFonte_(titulo)));
    });
    if (repetida) throw new Error('Já existe no catálogo a fonte "' + repetida.nome + '".');

    const agora = new Date();
    const valores = { item: item, nome: nome, tituloInterno: titulo, ativo: dados.ativo !== false };
    if (!existente) {
      const nova = Object.assign({ id: gerarIdFonte_(nome, catalogo) }, valores,
        { criadoEm: agora, criadoPor: autor.email, atualizadoEm: agora, atualizadoPor: autor.email });
      incluir_(ABAS.FONTES, [nova]);
      gravarLog_('CRIAR', ABAS.FONTES, nova.id, null, nova);
      return resultadoConfig_('Fonte "' + nome + '" incluída no catálogo.');
    }
    const mudancas = diferencas_(existente, valores);
    if (!Object.keys(mudancas).length) return resultadoConfig_('Nenhuma alteração na fonte.');
    atualizar_(ABAS.FONTES, existente._linha, Object.assign({}, mudancas, { atualizadoEm: agora, atualizadoPor: autor.email }));
    gravarLog_('EDITAR', ABAS.FONTES, id, selecionar_(existente, Object.keys(mudancas)), mudancas);
    return resultadoConfig_('Fonte "' + nome + '" atualizada.');
  });
}

/** Id legível e único, ex.: "Relatório campanhas SMS" → F-RELATORIO-CAMPANHAS-SMS. */
function gerarIdFonte_(nome, catalogo) {
  const base = 'F-' + normalizarNomeFonte_(nome).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  const usados = {};
  catalogo.forEach(function (f) { usados[f.id] = true; });
  if (!usados[base]) return base;
  for (let n = 2; ; n++) if (!usados[base + '-' + n]) return base + '-' + n;
}
