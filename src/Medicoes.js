/**
 * Medicoes.js – lançamento de competências: quantidades medidas e ANS.
 * Nenhum cálculo usa valor em reais: o controle é por quantidade e ANS.
 */

const STATUS = {
  RASCUNHO: 'RASCUNHO',
  EM_CONFERENCIA: 'EM_CONFERENCIA',
  INSTRUINDO_SEI: 'INSTRUINDO_SEI',
  ENVIADA_COGECON: 'ENVIADA_COGECON'
};

const STATUS_ROTULOS = {
  RASCUNHO: 'Rascunho',
  EM_CONFERENCIA: 'Em conferência',
  INSTRUINDO_SEI: 'Instruindo SEI',
  ENVIADA_COGECON: 'Enviada à COGECON'
};

/* ---------- Funções chamadas pelo front-end ---------- */

/** Itens, competências já lançadas e parâmetros da tela de lançamento. */
function getDadosLancamento() {
  requirePerfil_([PERFIS.FISCAL_TECNICO]);
  return {
    itens: listarItens_(),
    competencias: listarResumoCompetencias_(),
    ansLimiteMin: numeroConfig_(lerConfig_(), 'ANS_LIMITE_MIN'),
    mesLimite: mesAnterior_(mesAtual_())
  };
}

function getCompetencia(competencia) {
  requirePerfil_([PERFIS.FISCAL_TECNICO]);
  const comp = validarFormatoCompetencia_(competencia);
  const registro = buscarCompetencia_(comp);
  if (!registro) throw new Error('Competência ' + rotuloCompetencia_(comp) + ' não encontrada.');
  return competenciaParaCliente_(registro);
}

/**
 * Cria ou edita uma competência e suas medições.
 * dados: { novo, competencia, itens: [{ item, quantidadeRelatorio, quantidade, ajusteObs }],
 *          ansUptimePct, ansMinutosManual, ansMinutos, ansObs, pastaDrive }
 * enviarConferencia: true muda o status de RASCUNHO para EM_CONFERENCIA.
 */
function salvarCompetencia(dados, enviarConferencia) {
  const autor = requirePerfil_([PERFIS.FISCAL_TECNICO]);
  if (!dados || typeof dados !== 'object') throw new Error('Dados da competência não informados.');
  const enviar = enviarConferencia === true;
  const comp = validarCompetenciaLancavel_(dados.competencia);
  const rotulo = rotuloCompetencia_(comp);

  return comLock_(function () {
    const vigencia = vigenciaDaCompetencia_(comp);
    if (!vigencia) throw new Error('A competência ' + rotulo + ' não está dentro de nenhuma vigência cadastrada.');

    const existente = buscarCompetencia_(comp);
    if (dados.novo === true && existente) {
      throw new Error('A competência ' + rotulo + ' já foi lançada. Abra-a na lista para editar.');
    }
    if (dados.novo !== true && !existente) throw new Error('Competência ' + rotulo + ' não encontrada.');
    if (existente && existente.status === STATUS.ENVIADA_COGECON) {
      throw new Error('A competência ' + rotulo + ' já foi enviada à COGECON e está bloqueada para edição.');
    }
    if (enviar && existente && existente.status !== STATUS.RASCUNHO) {
      throw new Error('A competência ' + rotulo + ' já foi enviada para conferência.');
    }

    const config = lerConfig_();
    const limiteAns = numeroConfig_(config, 'ANS_LIMITE_MIN');
    const medicoesExistentes = medicoesDa_(comp);
    const medicoes = validarMedicoes_(dados.itens, listarItens_(), medicoesExistentes, enviar);
    const ans = validarAns_(dados, comp, limiteAns, enviar);
    const pastaDrive = validarPastaDrive_(dados.pastaDrive);

    const agora = new Date();
    const logs = [];
    const statusAnterior = existente ? existente.status : null;
    const statusNovo = enviar ? STATUS.EM_CONFERENCIA : (statusAnterior || STATUS.RASCUNHO);
    const campos = {
      vigencia: vigencia.id,
      ansUptimePct: ans.uptime,
      ansMinutos: ans.minutos,
      ansCumprido: ans.cumprido,
      ansObs: ans.obs,
      pastaDrive: pastaDrive
    };

    // Competência
    if (!existente) {
      const nova = Object.assign({ competencia: comp, status: statusNovo }, campos, {
        criadoEm: agora, criadoPor: autor.email, atualizadoEm: agora, atualizadoPor: autor.email
      });
      incluir_(ABAS.COMPETENCIAS, [nova]);
      logs.push(montarLog_('CRIAR', ABAS.COMPETENCIAS, comp, null, nova));
    } else {
      const mudancas = diferencas_(existente, campos);
      const mudouStatus = statusNovo !== statusAnterior;
      if (Object.keys(mudancas).length || mudouStatus) {
        const alteracoes = Object.assign({}, mudancas, { atualizadoEm: agora, atualizadoPor: autor.email });
        if (mudouStatus) alteracoes.status = statusNovo;
        atualizar_(ABAS.COMPETENCIAS, existente._linha, alteracoes);
      }
      if (Object.keys(mudancas).length) {
        logs.push(montarLog_('EDITAR', ABAS.COMPETENCIAS, comp, selecionar_(existente, Object.keys(mudancas)), mudancas));
      }
      if (mudouStatus) {
        logs.push(montarLog_('STATUS', ABAS.COMPETENCIAS, comp, { status: statusAnterior }, { status: statusNovo }));
      }
    }

    // Medições (uma linha por competência e item)
    const novas = [];
    medicoes.forEach(function (m) {
      const chave = comp + '/' + m.item;
      const valores = { quantidade: m.quantidade, quantidadeRelatorio: m.quantidadeRelatorio, ajusteObs: m.ajusteObs };
      const atual = medicoesExistentes.find(function (x) { return Number(x.item) === m.item; });
      if (!atual) {
        const nova = Object.assign({ competencia: comp, item: m.item }, valores, {
          criadoEm: agora, criadoPor: autor.email, atualizadoEm: agora, atualizadoPor: autor.email
        });
        novas.push(nova);
        logs.push(montarLog_('CRIAR', ABAS.MEDICOES, chave, null, nova));
        return;
      }
      const mudancas = diferencas_(atual, valores);
      if (!Object.keys(mudancas).length) return;
      atualizar_(ABAS.MEDICOES, atual._linha,
        Object.assign({}, mudancas, { atualizadoEm: agora, atualizadoPor: autor.email }));
      logs.push(montarLog_('EDITAR', ABAS.MEDICOES, chave, selecionar_(atual, Object.keys(mudancas)), mudancas));
    });
    incluir_(ABAS.MEDICOES, novas);
    incluir_(ABAS.LOG, logs);

    let mensagem;
    if (!logs.length) mensagem = 'Nenhuma alteração para salvar.';
    else if (!existente) mensagem = 'Competência ' + rotulo + (enviar ? ' criada e enviada para conferência.' : ' salva como rascunho.');
    else if (enviar) mensagem = 'Competência ' + rotulo + ' enviada para conferência.';
    else mensagem = 'Competência ' + rotulo + ' atualizada.';

    return {
      mensagem: mensagem,
      avisos: avisosDaCompetencia_(vigencia.id, config, ans, limiteAns),
      competencia: competenciaParaCliente_(buscarCompetencia_(comp)),
      competencias: listarResumoCompetencias_()
    };
  });
}

/* ---------- Leitura ---------- */

function listarItens_() {
  return listar_(ABAS.ITENS)
    .map(function (i) {
      return {
        item: Number(i.item),
        descricao: String(i.descricao),
        unidade: String(i.unidade),
        tipo: String(i.tipo).trim(),
        fonte: String(i.fonte || '')
      };
    })
    .sort(function (a, b) { return a.item - b.item; });
}

function buscarCompetencia_(comp) {
  return listar_(ABAS.COMPETENCIAS).find(function (c) {
    return textoCompetencia_(c.competencia) === comp;
  }) || null;
}

function medicoesDa_(comp) {
  return listar_(ABAS.MEDICOES).filter(function (m) {
    return textoCompetencia_(m.competencia) === comp;
  });
}

function listarResumoCompetencias_() {
  return listar_(ABAS.COMPETENCIAS)
    .map(function (c) {
      return {
        competencia: textoCompetencia_(c.competencia),
        vigencia: String(c.vigencia),
        status: String(c.status),
        statusRotulo: STATUS_ROTULOS[c.status] || String(c.status),
        ansUptimePct: numeroOuNulo_(c.ansUptimePct),
        ansMinutos: numeroOuNulo_(c.ansMinutos),
        ansCumprido: c.ansCumprido === '' ? null : ehVerdadeiro_(c.ansCumprido)
      };
    })
    .sort(function (a, b) { return a.competencia < b.competencia ? 1 : -1; });
}

function competenciaParaCliente_(registro) {
  const comp = textoCompetencia_(registro.competencia);
  const c = paraCliente_(registro);
  c.competencia = comp;
  c.statusRotulo = STATUS_ROTULOS[c.status] || String(c.status);
  c.ansUptimePct = numeroOuNulo_(registro.ansUptimePct);
  c.ansMinutos = numeroOuNulo_(registro.ansMinutos);
  c.ansCumprido = registro.ansCumprido === '' ? null : ehVerdadeiro_(registro.ansCumprido);
  c.ansMinutosCalculado = c.ansUptimePct === null ? null : calcularMinutosAns_(c.ansUptimePct, comp);
  c.editavel = registro.status !== STATUS.ENVIADA_COGECON;
  c.medicoes = medicoesDa_(comp).map(function (m) {
    return {
      item: Number(m.item),
      quantidade: numeroOuNulo_(m.quantidade),
      quantidadeRelatorio: numeroOuNulo_(m.quantidadeRelatorio),
      ajusteObs: String(m.ajusteObs || '')
    };
  });
  return c;
}

/* ---------- Validações ---------- */

function validarFormatoCompetencia_(valor) {
  const comp = String(valor || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(comp)) throw new Error('Informe a competência no formato AAAA-MM.');
  return comp;
}

/** Só meses já encerrados podem ser lançados. */
function validarCompetenciaLancavel_(valor) {
  const comp = validarFormatoCompetencia_(valor);
  if (comp >= mesAtual_()) {
    throw new Error('Só é possível lançar meses já encerrados. A competência mais recente permitida é ' +
      rotuloCompetencia_(mesAnterior_(mesAtual_())) + '.');
  }
  return comp;
}

/**
 * Confere as quantidades e devolve só as medições a gravar.
 * completo = true exige os itens não eventuais (envio para conferência).
 */
function validarMedicoes_(entrada, itens, existentes, completo) {
  const porItem = {};
  (Array.isArray(entrada) ? entrada : []).forEach(function (e) {
    if (e && e.item !== undefined && e.item !== null) porItem[Number(e.item)] = e;
  });
  const erros = [];
  const resultado = [];

  itens.forEach(function (it) {
    const e = porItem[it.item] || {};
    const rotulo = 'Item ' + it.item;
    const jaLancado = existentes.some(function (x) { return Number(x.item) === it.item; });
    const quantidade = lerInteiro_(e.quantidade, rotulo + ' – quantidade medida', erros);
    const relatorio = it.tipo === 'CONSUMO'
      ? lerInteiro_(e.quantidadeRelatorio, rotulo + ' – quantidade do relatório', erros)
      : quantidade;
    if (quantidade === undefined || relatorio === undefined) return;
    const obs = String(e.ajusteObs || '').trim();

    if (quantidade === null && relatorio === null) {
      if (jaLancado) {
        erros.push(rotulo + ': a quantidade já lançada não pode ficar em branco. Informe 0 se não houve consumo.');
      } else if (completo && it.tipo !== 'EVENTUAL') {
        erros.push(rotulo + ': informe a quantidade para enviar à conferência.');
      }
      return;
    }
    if (quantidade === null || relatorio === null) {
      erros.push(rotulo + ': informe a quantidade do relatório e a quantidade medida.');
      return;
    }
    if (it.tipo === 'EVENTUAL' && quantidade === 0 && !jaLancado) return;
    if (quantidade !== relatorio && !obs) {
      erros.push(rotulo + ': a quantidade medida (' + formatarInteiro_(quantidade) + ') é diferente da do relatório (' +
        formatarInteiro_(relatorio) + '). Explique o ajuste na observação.');
      return;
    }
    resultado.push({ item: it.item, quantidade: quantidade, quantidadeRelatorio: relatorio, ajusteObs: obs });
  });

  if (erros.length) throw new Error(erros.join('\n'));
  return resultado;
}

function validarAns_(dados, comp, limite, completo) {
  const obs = String(dados.ansObs || '').trim();
  const bruto = dados.ansUptimePct;
  if (bruto === undefined || bruto === null || String(bruto).trim() === '') {
    if (completo) throw new Error('Informe o uptime do ANS para enviar à conferência.');
    return { uptime: '', minutos: '', cumprido: '', obs: obs };
  }
  const uptime = lerPercentual_(bruto);
  if (uptime === null) throw new Error('O uptime do ANS deve ser um número entre 0 e 100 (ex.: 99,97).');

  const calculado = calcularMinutosAns_(uptime, comp);
  let minutos = calculado;
  if (dados.ansMinutosManual === true) {
    const erros = [];
    const informado = lerInteiro_(dados.ansMinutos, 'Os minutos de indisponibilidade', erros);
    if (erros.length) throw new Error(erros[0]);
    if (informado === null) throw new Error('Informe os minutos de indisponibilidade corrigidos.');
    if (informado !== calculado && !obs) {
      throw new Error('Os minutos foram corrigidos manualmente (' + informado + ' em vez de ' + calculado +
        '). Explique a correção na observação do ANS.');
    }
    minutos = informado;
  }
  return { uptime: uptime, minutos: minutos, cumprido: minutos <= limite, obs: obs };
}

function validarPastaDrive_(valor) {
  const url = String(valor || '').trim();
  if (!url) return '';
  if (!/^https:\/\/drive\.google\.com\/\S+$/.test(url)) {
    throw new Error('O link da pasta deve ser do Google Drive (começar com https://drive.google.com/).');
  }
  return url;
}

/**
 * Inteiro ≥ 0. Aceita separador de milhar com ponto (33.317).
 * Retorna null se vazio e undefined se inválido (registrando o erro).
 */
function lerInteiro_(valor, rotulo, erros) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  let s = String(valor).trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+$/.test(s)) {
    erros.push(rotulo + ' deve ser um número inteiro maior ou igual a 0.');
    return undefined;
  }
  return parseInt(s, 10);
}

/** Percentual entre 0 e 100, com vírgula ou ponto decimal. Retorna null se inválido. */
function lerPercentual_(valor) {
  const s = String(valor).trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n <= 100 ? n : null;
}

/* ---------- Regras de cálculo ---------- */

/** Minutos estimados de indisponibilidade = (100% − uptime%) × minutos do mês. */
function calcularMinutosAns_(uptime, comp) {
  return Math.round((100 - uptime) / 100 * diasNoMes_(comp) * 1440);
}

function vigenciaDaCompetencia_(comp) {
  const inicioMes = comp + '-01';
  const fimMes = comp + '-' + ('0' + diasNoMes_(comp)).slice(-2);
  return listar_(ABAS.VIGENCIAS)
    .map(function (v) {
      return { id: String(v.id).trim(), inicio: dataIso_(v.inicio), fim: dataIso_(v.fim) };
    })
    .find(function (v) { return v.inicio && v.fim && v.inicio <= inicioMes && v.fim >= fimMes; }) || null;
}

/** Avisos após salvar: saldo da vigência ≥ ALERTA_SALDO e ANS não cumprido. */
function avisosDaCompetencia_(vigenciaId, config, ans, limiteAns) {
  const avisos = [];
  const alerta = numeroConfig_(config, 'ALERTA_SALDO');
  const consumo = consumoDaVigencia_(vigenciaId);
  quantidadesContratadas_(vigenciaId).forEach(function (q) {
    const usado = consumo[q.item] || 0;
    if (q.contratado > 0 && usado / q.contratado >= alerta) {
      avisos.push('Item ' + q.item + ': ' + formatarPercentual_(usado / q.contratado) +
        ' da quantidade contratada já consumida na vigência (' + formatarInteiro_(usado) + ' de ' +
        formatarInteiro_(q.contratado) + ').');
    }
  });

  if (ans.cumprido === false) {
    avisos.push('ANS não cumprido: ' + ans.minutos + ' minutos de indisponibilidade (limite de ' + limiteAns +
      '). Registre a ocorrência e avise o gestor.');
  }
  return avisos;
}

/**
 * Soma das quantidades medidas por item nas competências da vigência,
 * em qualquer status (inclusive rascunho): { item: total }.
 */
function consumoDaVigencia_(vigenciaId) {
  const competenciasDaVigencia = {};
  listar_(ABAS.COMPETENCIAS).forEach(function (c) {
    if (String(c.vigencia).trim() === vigenciaId) competenciasDaVigencia[textoCompetencia_(c.competencia)] = true;
  });
  const consumo = {};
  listar_(ABAS.MEDICOES).forEach(function (m) {
    if (!competenciasDaVigencia[textoCompetencia_(m.competencia)]) return;
    const item = Number(m.item);
    consumo[item] = (consumo[item] || 0) + (Number(m.quantidade) || 0);
  });
  return consumo;
}

function quantidadesContratadas_(vigenciaId) {
  return listar_(ABAS.QTD_CONTRATADAS)
    .filter(function (q) { return String(q.vigencia).trim() === vigenciaId; })
    .map(function (q) { return { item: Number(q.item), contratado: Number(q.qtdContratada) }; });
}

/* ---------- Utilitários de competência e formatação ---------- */

function textoCompetencia_(v) {
  return (v instanceof Date) ? Utilities.formatDate(v, FUSO, 'yyyy-MM') : String(v).trim();
}

function rotuloCompetencia_(comp) {
  return comp.slice(5) + '/' + comp.slice(0, 4);
}

function mesAtual_() {
  return Utilities.formatDate(new Date(), FUSO, 'yyyy-MM');
}

function mesAnterior_(comp) {
  const ano = Number(comp.slice(0, 4));
  const mes = Number(comp.slice(5));
  return mes === 1 ? (ano - 1) + '-12' : ano + '-' + ('0' + (mes - 1)).slice(-2);
}

function diasNoMes_(comp) {
  return new Date(Number(comp.slice(0, 4)), Number(comp.slice(5)), 0).getDate();
}

function dataIso_(d) {
  return (d instanceof Date) ? Utilities.formatDate(d, FUSO, 'yyyy-MM-dd') : '';
}

function numeroOuNulo_(v) {
  return (v === '' || v === null || v === undefined) ? null : Number(v);
}

function formatarInteiro_(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatarPercentual_(fracao) {
  return (fracao * 100).toFixed(1).replace('.', ',') + '%';
}
