# Histórico de versões

O sistema segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/): `MAIOR.MENOR.CORREÇÃO`.
Enquanto as fases do `docs/SPEC.md` estiverem em construção, a versão fica em `0.x`: cada fase concluída sobe a versão MENOR e cada correção sobe a CORREÇÃO. A `1.0.0` marca o sistema completo em produção.

## [Não lançado]

### Incluído
- `carregarFeriados2026()`: carga das 41 datas da Portaria TRE-MA nº 10/2026 na aba `Feriados` (inclui os pontos facultativos de 18/02 e 28/10 e os feriados municipais de São Luís de 29/06 e 08/09), com registro no `Log`. Executada em 10/10/2026.
- Ambiente de homologação: planilha e script próprios, branch `homologacao`, `.clasp.json` apontando para a homologação e `.clasp.producao.json` para a produção.
- Faixa "AMBIENTE DE HOMOLOGAÇÃO" e prefixo no título da aba do navegador quando o script não é o de produção.

## [0.3.0] – 09/10/2026 – Fase 3: Painel

### Incluído
- Painel (todos os perfis): cards de saldo dos itens 1 a 5 (contratado, consumido, saldo e barra de %), tabela dos itens eventuais, destaque a partir de 80% e acima de 100%.
- Pendências e alertas: saldo ≥ `ALERTA_SALDO`, ANS não cumprido, meses encerrados da vigência ainda não lançados (a partir do 1º dia útil do mês seguinte) e competência sem os 4 IDs do SEI depois de 10 dias úteis contados do 1º dia útil do mês seguinte.
- Tabela das competências da vigência com status, ANS e IDs do SEI (x/4). Fiscal técnico e superadmin abrem a competência direto do painel.
- Nova aba `Feriados` (`data`, `descricao`), criada pelo `setup()`, usada na contagem de dias úteis.
- O consumo da vigência passa a ser calculado num só lugar (painel e aviso ao salvar).

## [0.2.0] – 09/10/2026 – Fase 2: Lançamento

### Incluído
- Tela "Lançar competência" (FISCAL_TECNICO e SUPERADMIN): lista das competências, criação e edição com itens 1 a 5, itens eventuais recolhíveis, ANS e link da pasta do Drive.
- Quantidade medida acompanha a do relatório; se forem diferentes, a observação do ajuste é obrigatória.
- Cálculo do ANS: minutos = arredondar((100 − uptime%) / 100 × minutos do mês), com correção manual mediante observação.
- Validações no servidor: competência única, dentro de uma vigência e de mês já encerrado; inteiros ≥ 0; competência enviada à COGECON bloqueada.
- "Salvar rascunho" e "Enviar para conferência" (exige itens 1 a 5 e ANS). Edição em conferência mantém o status.
- Avisos ao salvar: item com consumo ≥ 80% na vigência e ANS não cumprido.
- Log de CRIAR, EDITAR e STATUS para competências e medições.
- `carregarHistorico()`: carga de 2026-08 (enviada à COGECON) e 2026-09 (em conferência).

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
