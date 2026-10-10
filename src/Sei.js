/**
 * Sei.js – detalhe da competência, IDs do SEI, transições de status,
 * reabertura (superadmin) e ciente do gestor.
 */

/* ---------- Funções chamadas pelo front-end ---------- */

function getDetalheCompetencia(competencia) {
  const usuario = requirePerfil_(TODOS_PERFIS);
  return detalheCompetencia_(buscarCompetenciaObrigatoria_(competencia), usuario);
}

/** Grava os IDs do SEI e a data de envio. dados: { ids: { campo: valor }, dataEnvioCogecon: 'yyyy-MM-dd' } */
function salvarDadosSei(competencia, dados) {
  const autor = requirePerfil_([PERFIS.FISCAL_TECNICO]);
  return comLock_(function () {
    const registro = buscarCompetenciaObrigatoria_(competencia);
    exigirEditavel_(registro);
    const logs = [];
    const mudou = aplicarDadosSei_(registro, dados, autor, logs);
    incluir_(ABAS.LOG, logs);
    return resultadoSei_(registro, autor, mudou ? 'Dados do SEI salvos.' : 'Nenhuma alteração para salvar.');
  });
}

/**
 * Avança o status: EM_CONFERENCIA → INSTRUINDO_SEI ou INSTRUINDO_SEI → ENVIADA_COGECON.
 * `dados` (opcional) são os IDs/data da tela, gravados antes da transição.
 */
function avancarStatus(competencia, destino, dados) {
  const autor = requirePerfil_([PERFIS.FISCAL_TECNICO]);
  return comLock_(function () {
    const registro = buscarCompetenciaObrigatoria_(competencia);
    const comp = textoCompetencia_(registro.competencia);
    const rotulo = rotuloCompetencia_(comp);
    const origem = String(registro.status);
    const permitido = (origem === STATUS.EM_CONFERENCIA && destino === STATUS.INSTRUINDO_SEI) ||
      (origem === STATUS.INSTRUINDO_SEI && destino === STATUS.ENVIADA_COGECON);
    if (!permitido) {
      throw new Error('Não é possível passar a competência ' + rotulo + ' de "' + (STATUS_ROTULOS[origem] || origem) +
        '" para "' + (STATUS_ROTULOS[destino] || destino) + '".');
    }

    const logs = [];
    if (dados) aplicarDadosSei_(registro, dados, autor, logs);

    if (destino === STATUS.ENVIADA_COGECON) {
      const faltando = CAMPOS_IDS_SEI.filter(function (f) { return String(registro[f.campo] || '').trim() === ''; });
      const erros = [];
      if (faltando.length) {
        erros.push('Preencha os IDs do SEI que faltam: ' + faltando.map(function (f) { return f.rotulo; }).join(', ') + '.');
      }
      if (!(registro.dataEnvioCogecon instanceof Date)) erros.push('Informe a data de envio à COGECON.');
      if (erros.length) throw new Error(erros.join('\n'));
    }

    atualizar_(ABAS.COMPETENCIAS, registro._linha, { status: destino, atualizadoEm: new Date(), atualizadoPor: autor.email });
    logs.push(montarLog_('STATUS', ABAS.COMPETENCIAS, comp, { status: origem }, { status: destino }));
    incluir_(ABAS.LOG, logs);
    registro.status = destino;
    return resultadoSei_(registro, autor, 'Competência ' + rotulo + ': status alterado para "' + STATUS_ROTULOS[destino] + '".');
  });
}

/** Superadmin: competência enviada volta para INSTRUINDO_SEI, com justificativa no Log. */
function reabrirCompetencia(competencia, justificativa) {
  const autor = requirePerfil_([PERFIS.SUPERADMIN]);
  const motivo = String(justificativa || '').trim();
  if (motivo.length < 10) throw new Error('Escreva a justificativa da reabertura (pelo menos 10 caracteres).');
  return comLock_(function () {
    const registro = buscarCompetenciaObrigatoria_(competencia);
    const comp = textoCompetencia_(registro.competencia);
    if (registro.status !== STATUS.ENVIADA_COGECON) {
      throw new Error('Só uma competência enviada à COGECON pode ser reaberta.');
    }
    const antes = selecionar_(registro, ['status', 'cienteGestorPor', 'cienteGestorEm']);
    const alteracoes = {
      status: STATUS.INSTRUINDO_SEI, cienteGestorPor: '', cienteGestorEm: '',
      atualizadoEm: new Date(), atualizadoPor: autor.email
    };
    atualizar_(ABAS.COMPETENCIAS, registro._linha, alteracoes);
    gravarLog_('STATUS', ABAS.COMPETENCIAS, comp, antes,
      { status: STATUS.INSTRUINDO_SEI, cienteGestorPor: '', cienteGestorEm: '', justificativa: motivo });
    Object.assign(registro, alteracoes);
    return resultadoSei_(registro, autor, 'Competência ' + rotuloCompetencia_(comp) + ' reaberta para "' +
      STATUS_ROTULOS[STATUS.INSTRUINDO_SEI] + '".');
  });
}

/** Gestor: registra ciência de uma competência enviada à COGECON. */
function registrarCiente(competencia) {
  const autor = requirePerfil_([PERFIS.GESTOR]);
  if (autor.perfil !== PERFIS.GESTOR) throw new Error('Só o perfil Gestor pode registrar ciente.');
  return comLock_(function () {
    const registro = buscarCompetenciaObrigatoria_(competencia);
    const comp = textoCompetencia_(registro.competencia);
    if (registro.status !== STATUS.ENVIADA_COGECON) {
      throw new Error('O ciente só pode ser registrado em competência enviada à COGECON.');
    }
    if (registro.cienteGestorEm instanceof Date) {
      throw new Error('O ciente desta competência já foi registrado por ' + registro.cienteGestorPor + '.');
    }
    const alteracoes = { cienteGestorPor: String(autor.nome), cienteGestorEm: new Date() };
    atualizar_(ABAS.COMPETENCIAS, registro._linha,
      Object.assign({}, alteracoes, { atualizadoEm: new Date(), atualizadoPor: autor.email }));
    gravarLog_('EDITAR', ABAS.COMPETENCIAS, comp, selecionar_(registro, ['cienteGestorPor', 'cienteGestorEm']), alteracoes);
    Object.assign(registro, alteracoes);
    return resultadoSei_(registro, autor, 'Ciente registrado na competência ' + rotuloCompetencia_(comp) + '.');
  });
}

/* ---------- Regras internas ---------- */

function buscarCompetenciaObrigatoria_(competencia) {
  const comp = validarFormatoCompetencia_(competencia);
  const registro = buscarCompetencia_(comp);
  if (!registro) throw new Error('Competência ' + rotuloCompetencia_(comp) + ' não encontrada.');
  return registro;
}

function exigirEditavel_(registro) {
  if (registro.status === STATUS.ENVIADA_COGECON) {
    throw new Error('A competência ' + rotuloCompetencia_(textoCompetencia_(registro.competencia)) +
      ' já foi enviada à COGECON e está bloqueada. Só o superadmin pode reabri-la.');
  }
}

/** Valida e grava IDs e data de envio no registro (e na planilha). Retorna true se algo mudou. */
function aplicarDadosSei_(registro, dados, autor, logs) {
  exigirEditavel_(registro);
  const comp = textoCompetencia_(registro.competencia);
  const entrada = (dados && dados.ids) || {};
  const novos = {};
  const erros = [];

  CAMPOS_IDS_SEI.forEach(function (f) {
    const valor = String(entrada[f.campo] === undefined ? (registro[f.campo] || '') : entrada[f.campo]).trim();
    if (valor && !/^\d+$/.test(valor)) {
      erros.push('O ID do ' + f.rotulo + ' deve ter só números (ex.: 2866941).');
    }
    novos[f.campo] = valor;
  });

  const informouData = !!dados && Object.prototype.hasOwnProperty.call(dados, 'dataEnvioCogecon');
  const textoData = informouData ? String(dados.dataEnvioCogecon || '').trim() : dataIso_(registro.dataEnvioCogecon);
  if (textoData) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(textoData)) {
      erros.push('Data de envio inválida.');
    } else {
      const hoje = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
      const minima = proximoMes_(comp) + '-01';
      if (textoData > hoje) erros.push('A data de envio não pode ser futura.');
      else if (textoData < minima) erros.push('A data de envio não pode ser anterior a ' + dataBr_(minima) + '.');
      else novos.dataEnvioCogecon = new Date(Number(textoData.slice(0, 4)), Number(textoData.slice(5, 7)) - 1, Number(textoData.slice(8, 10)));
    }
  } else if (informouData) {
    novos.dataEnvioCogecon = '';
  }
  if (erros.length) throw new Error(erros.join('\n'));

  const mudancas = diferencas_(registro, novos);
  if (!Object.keys(mudancas).length) return false;
  atualizar_(ABAS.COMPETENCIAS, registro._linha,
    Object.assign({}, mudancas, { atualizadoEm: new Date(), atualizadoPor: autor.email }));
  logs.push(montarLog_('EDITAR', ABAS.COMPETENCIAS, comp, selecionar_(registro, Object.keys(mudancas)), mudancas));
  Object.assign(registro, mudancas);
  return true;
}

function resultadoSei_(registro, usuario, mensagem) {
  return { mensagem: mensagem, detalhe: detalheCompetencia_(registro, usuario) };
}

/** Tudo o que a tela de detalhe precisa, incluindo permissões do usuário e textos do SEI. */
function detalheCompetencia_(registro, usuario) {
  const comp = textoCompetencia_(registro.competencia);
  const c = competenciaParaCliente_(registro);
  const itens = listarItens_();
  const status = String(registro.status);
  const ehSuperadmin = usuario.perfil === PERFIS.SUPERADMIN;
  const ehFiscal = ehSuperadmin || usuario.perfil === PERFIS.FISCAL_TECNICO;
  const temCiente = registro.cienteGestorEm instanceof Date;

  c.itens = itens;
  c.ids = CAMPOS_IDS_SEI.map(function (f) {
    return { campo: f.campo, rotulo: f.rotulo, valor: String(registro[f.campo] || '') };
  });
  c.dataEnvioCogecon = dataIso_(registro.dataEnvioCogecon);
  c.cienteGestorPor = String(registro.cienteGestorPor || '');
  c.cienteGestorEm = temCiente ? isoLocal_(registro.cienteGestorEm) : '';
  c.linhaDoTempo = linhaDoTempo_(comp);
  c.textos = gerarTextosSei_(registro, c.medicoes, itens, lerConfig_());
  c.permissoes = {
    editarLancamento: ehFiscal && status !== STATUS.ENVIADA_COGECON,
    editarSei: ehFiscal && status !== STATUS.ENVIADA_COGECON,
    iniciarInstrucao: ehFiscal && status === STATUS.EM_CONFERENCIA,
    enviarCogecon: ehFiscal && status === STATUS.INSTRUINDO_SEI,
    reabrir: ehSuperadmin && status === STATUS.ENVIADA_COGECON,
    ciente: usuario.perfil === PERFIS.GESTOR && status === STATUS.ENVIADA_COGECON && !temCiente
  };
  return c;
}

/** Eventos de status e ciente da competência, a partir do Log, do mais antigo ao mais novo. */
function linhaDoTempo_(comp) {
  const nomes = {};
  listar_(ABAS.USUARIOS).forEach(function (u) { nomes[normalizarEmail_(u.email)] = String(u.nome); });
  const lerJson = function (texto) {
    try { return texto ? JSON.parse(texto) : {}; } catch (e) { return {}; }
  };
  const eventos = [];
  listar_(ABAS.LOG).forEach(function (l) {
    if (l.entidade !== ABAS.COMPETENCIAS || String(l.chave) !== comp) return;
    const antes = lerJson(l.antes);
    const depois = lerJson(l.depois);
    let descricao = null;
    if (l.acao === 'CRIAR') {
      descricao = 'Competência criada com status "' + (STATUS_ROTULOS[depois.status] || depois.status) + '"' +
        (depois.obs ? ' (' + String(depois.obs).replace(/\.+$/, '') + ')' : '') + '.';
    } else if (l.acao === 'STATUS') {
      descricao = (depois.justificativa ? 'Reaberta: ' : 'Status: ') + '"' + (STATUS_ROTULOS[antes.status] || antes.status) +
        '" → "' + (STATUS_ROTULOS[depois.status] || depois.status) + '"' +
        (depois.justificativa ? '. Justificativa: ' + depois.justificativa : '') + '.';
    } else if (l.acao === 'EDITAR' && depois.cienteGestorPor) {
      descricao = 'Ciente do gestor registrado.';
    }
    if (!descricao) return;
    const email = normalizarEmail_(l.email);
    eventos.push({
      quando: l.timestamp instanceof Date ? isoLocal_(l.timestamp) : '',
      quem: nomes[email] || email,
      descricao: descricao
    });
  });
  return eventos;
}
