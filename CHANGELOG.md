# Histórico de versões

O sistema segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/): `MAIOR.MENOR.CORREÇÃO`.
Enquanto as fases do `docs/SPEC.md` estiverem em construção, a versão fica em `0.x`: cada fase concluída sobe a versão MENOR e cada correção sobe a CORREÇÃO. A `1.0.0` marca o sistema completo em produção.

## [0.1.0] – 09/10/2026 – Fase 1: Base

### Incluído
- `appsscript.json`: fuso `America/Sao_Paulo`, Web App com acesso restrito ao domínio e executado como quem implantou, escopos mínimos (planilha atual e e-mail).
- `setup()`: cria as 9 abas com cabeçalhos e os dados iniciais da seção 3 do SPEC, sem apagar nem duplicar nada. Acerta o fuso da planilha.
- Perfis e permissões (`requirePerfil_`) conferidos no servidor.
- Tela de "Acesso não autorizado" com o e-mail de quem acessou.
- Casca do app com menu lateral conforme o perfil, nome, perfil, condição e versão do usuário.
- Tela de Usuários (somente SUPERADMIN): cadastrar, editar, ativar e desativar, com registro no `Log`. Só aceita e-mails `@tre-ma.jus.br`, impede desativar a própria conta e deixar o sistema sem superadmin ativo.

### Corrigido
- Datas da aba `Vigencias` gravadas um dia antes porque a planilha estava em `America/Los_Angeles` (migração `corrigirFusoHorario()`).
- Horário do cadastro do superadmin gravado com 4 h de atraso pelo mesmo motivo (migração `corrigirHorarioSuperadmin()`).
