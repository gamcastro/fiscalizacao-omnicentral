/**
 * Auth.js – perfis e permissões. Toda função pública do servidor começa
 * com requirePerfil_([...]); o front-end só esconde botões.
 */

const PERFIS = {
  SUPERADMIN: 'SUPERADMIN',
  FISCAL_TECNICO: 'FISCAL_TECNICO',
  GESTOR: 'GESTOR',
  FISCAL_DEMANDANTE: 'FISCAL_DEMANDANTE',
  FISCAL_ADMINISTRATIVO: 'FISCAL_ADMINISTRATIVO'
};

const PERFIL_ROTULOS = {
  SUPERADMIN: 'Superadmin',
  FISCAL_TECNICO: 'Fiscal técnico',
  GESTOR: 'Gestor',
  FISCAL_DEMANDANTE: 'Fiscal demandante',
  FISCAL_ADMINISTRATIVO: 'Fiscal administrativo'
};

const TODOS_PERFIS = Object.keys(PERFIS);

const CONDICOES = ['Titular', 'Substituto'];

const DOMINIO_PERMITIDO = 'tre-ma.jus.br';

function normalizarEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

/** E-mail de quem está acessando (vazio se o Google não informar). */
function emailAtual_() {
  return normalizarEmail_(Session.getActiveUser().getEmail());
}

function rotuloPerfil_(perfil) {
  return PERFIL_ROTULOS[perfil] || String(perfil || '');
}

function buscarUsuario_(email) {
  const alvo = normalizarEmail_(email);
  if (!alvo) return null;
  return listar_(ABAS.USUARIOS).find(function (u) {
    return normalizarEmail_(u.email) === alvo;
  }) || null;
}

/** Usuário logado, se estiver cadastrado e ativo; senão null. */
function getUsuarioAtual_() {
  const usuario = buscarUsuario_(emailAtual_());
  return (usuario && ehVerdadeiro_(usuario.ativo)) ? usuario : null;
}

/**
 * Barra quem não está cadastrado, está inativo ou não tem um dos perfis.
 * O SUPERADMIN sempre passa. Retorna o registro do usuário.
 */
function requirePerfil_(perfis) {
  const email = emailAtual_();
  if (!email) {
    throw new Error('Não foi possível identificar o seu e-mail. Entre com a sua conta @' + DOMINIO_PERMITIDO + '.');
  }
  const usuario = buscarUsuario_(email);
  if (!usuario || !ehVerdadeiro_(usuario.ativo)) {
    throw new Error('Acesso não autorizado para ' + email + '. Peça o cadastro ao superadmin.');
  }
  if (usuario.perfil !== PERFIS.SUPERADMIN && perfis.indexOf(usuario.perfil) < 0) {
    throw new Error('O seu perfil (' + rotuloPerfil_(usuario.perfil) + ') não tem permissão para esta ação.');
  }
  usuario.email = normalizarEmail_(usuario.email);
  return usuario;
}
