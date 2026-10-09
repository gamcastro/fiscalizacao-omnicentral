/**
 * Usuarios.js – cadastro de usuários (somente SUPERADMIN).
 * Usuários não são apagados: apenas ativados ou desativados.
 */

function listarUsuarios() {
  requirePerfil_([PERFIS.SUPERADMIN]);
  const usuarios = listar_(ABAS.USUARIOS)
    .map(function (u) {
      const c = paraCliente_(u);
      c.email = normalizarEmail_(c.email);
      c.ativo = ehVerdadeiro_(u.ativo);
      c.perfilRotulo = rotuloPerfil_(u.perfil);
      return c;
    })
    .sort(function (a, b) {
      return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    });
  return {
    usuarios: usuarios,
    perfis: TODOS_PERFIS.map(function (p) { return { codigo: p, rotulo: PERFIL_ROTULOS[p] }; }),
    condicoes: CONDICOES
  };
}

/**
 * Cadastra (dados.novo = true) ou edita um usuário.
 * dados: { novo, email, nome, perfil, condicao, ativo }
 */
function salvarUsuario(dados) {
  const autor = requirePerfil_([PERFIS.SUPERADMIN]);
  const d = validarUsuario_(dados);
  return comLock_(function () {
    const existente = buscarUsuario_(d.email);
    if (dados.novo === true) {
      if (existente) throw new Error('Já existe um usuário com o e-mail ' + d.email + '.');
      const agora = new Date();
      const novo = {
        email: d.email, nome: d.nome, perfil: d.perfil, condicao: d.condicao, ativo: d.ativo,
        criadoEm: agora, criadoPor: autor.email, atualizadoEm: agora, atualizadoPor: autor.email
      };
      incluir_(ABAS.USUARIOS, [novo]);
      gravarLog_('USUARIO', ABAS.USUARIOS, d.email, null, novo);
      return { mensagem: 'Usuário ' + d.nome + ' cadastrado.' };
    }
    if (!existente) throw new Error('Usuário ' + d.email + ' não encontrado.');
    return atualizarUsuario_(existente, d, autor);
  });
}

function alterarAtivoUsuario(email, ativo) {
  const autor = requirePerfil_([PERFIS.SUPERADMIN]);
  return comLock_(function () {
    const existente = buscarUsuario_(email);
    if (!existente) throw new Error('Usuário ' + normalizarEmail_(email) + ' não encontrado.');
    const d = {
      email: normalizarEmail_(existente.email),
      nome: String(existente.nome),
      perfil: String(existente.perfil),
      condicao: String(existente.condicao),
      ativo: ativo === true
    };
    return atualizarUsuario_(existente, d, autor);
  });
}

function atualizarUsuario_(existente, d, autor) {
  const alteracoes = { nome: d.nome, perfil: d.perfil, condicao: d.condicao, ativo: d.ativo };
  const mudou = Object.keys(alteracoes).some(function (k) {
    if (k === 'ativo') return ehVerdadeiro_(existente.ativo) !== alteracoes.ativo;
    return String(existente[k]) !== String(alteracoes[k]);
  });
  if (!mudou) return { mensagem: 'Nenhuma alteração para salvar.' };

  protegerSuperadmin_(existente, d, autor);

  alteracoes.atualizadoEm = new Date();
  alteracoes.atualizadoPor = autor.email;
  atualizar_(ABAS.USUARIOS, existente._linha, alteracoes);

  const antes = paraCliente_(existente);
  const depois = Object.assign({}, antes, alteracoes);
  gravarLog_('USUARIO', ABAS.USUARIOS, d.email, antes, depois);

  const acao = (ehVerdadeiro_(existente.ativo) !== d.ativo) ? (d.ativo ? 'reativado' : 'desativado') : 'atualizado';
  return { mensagem: 'Usuário ' + d.nome + ' ' + acao + '.' };
}

/** Impede que o superadmin se tranque fora ou que o sistema fique sem superadmin ativo. */
function protegerSuperadmin_(existente, d, autor) {
  const eraSuperadminAtivo = existente.perfil === PERFIS.SUPERADMIN && ehVerdadeiro_(existente.ativo);
  const continuaSuperadminAtivo = d.perfil === PERFIS.SUPERADMIN && d.ativo;
  if (!eraSuperadminAtivo || continuaSuperadminAtivo) return;

  if (normalizarEmail_(existente.email) === autor.email) {
    throw new Error('Você não pode desativar a sua própria conta nem tirar dela o perfil de superadmin.');
  }
  const ativos = listar_(ABAS.USUARIOS).filter(function (u) {
    return u.perfil === PERFIS.SUPERADMIN && ehVerdadeiro_(u.ativo);
  });
  if (ativos.length <= 1) {
    throw new Error('É preciso manter pelo menos um superadmin ativo.');
  }
}

function validarUsuario_(dados) {
  if (!dados || typeof dados !== 'object') throw new Error('Dados do usuário não informados.');
  const email = normalizarEmail_(dados.email);
  const nome = String(dados.nome || '').trim().replace(/\s+/g, ' ');
  const perfil = String(dados.perfil || '').trim();
  const condicao = String(dados.condicao || '').trim();
  const formatoEmail = new RegExp('^[a-z0-9._%+-]+@' + DOMINIO_PERMITIDO.replace(/\./g, '\\.') + '$');

  const erros = [];
  if (!email) erros.push('Informe o e-mail.');
  else if (!formatoEmail.test(email)) erros.push('O e-mail precisa ser do domínio @' + DOMINIO_PERMITIDO + '.');
  if (!nome) erros.push('Informe o nome.');
  if (TODOS_PERFIS.indexOf(perfil) < 0) erros.push('Escolha um perfil válido.');
  if (CONDICOES.indexOf(condicao) < 0) erros.push('Escolha a condição (Titular ou Substituto).');
  if (erros.length) throw new Error(erros.join(' '));

  return { email: email, nome: nome, perfil: perfil, condicao: condicao, ativo: dados.ativo === true };
}
