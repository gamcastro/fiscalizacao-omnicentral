/**
 * Code.js – entrada do Web App, roteamento e include().
 */

const TITULO_APP = 'Fiscalização Técnica – Contrato 20/2025';

/** Versão do sistema (SemVer). Atualizar junto com o CHANGELOG.md a cada entrega. */
const VERSAO_APP = '0.2.0';

function doGet() {
  try {
    const email = emailAtual_();
    if (!getUsuarioAtual_()) {
      const negado = HtmlService.createTemplateFromFile('AcessoNegado');
      negado.email = email || '(e-mail não identificado)';
      negado.erro = '';
      return finalizarPagina_(negado.evaluate());
    }
    return finalizarPagina_(HtmlService.createTemplateFromFile('Index').evaluate());
  } catch (e) {
    const erro = HtmlService.createTemplateFromFile('AcessoNegado');
    erro.email = '';
    erro.erro = e.message;
    return finalizarPagina_(erro.evaluate());
  }
}

function finalizarPagina_(saida) {
  return saida
    .setTitle(TITULO_APP)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Inclui o conteúdo de outro arquivo HTML dentro de um template. */
function include(nome) {
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
}

/** Itens do menu lateral e perfis que os veem (o SUPERADMIN vê todos). */
function menu_() {
  return [
    { id: 'painel', rotulo: 'Painel', perfis: TODOS_PERFIS },
    { id: 'lancamento', rotulo: 'Lançar competência', perfis: [PERFIS.FISCAL_TECNICO] },
    { id: 'usuarios', rotulo: 'Usuários', perfis: [PERFIS.SUPERADMIN] }
  ];
}

/** Dados do usuário logado e menu permitido, carregados ao abrir o app. */
function getContextoInicial() {
  const usuario = requirePerfil_(TODOS_PERFIS);
  const menu = menu_()
    .filter(function (m) {
      return usuario.perfil === PERFIS.SUPERADMIN || m.perfis.indexOf(usuario.perfil) >= 0;
    })
    .map(function (m) {
      return { id: m.id, rotulo: m.rotulo };
    });
  return {
    email: usuario.email,
    nome: String(usuario.nome),
    perfil: usuario.perfil,
    perfilRotulo: rotuloPerfil_(usuario.perfil),
    condicao: String(usuario.condicao),
    menu: menu,
    versao: VERSAO_APP
  };
}
