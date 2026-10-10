# Histórico de versões

O sistema segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/): `MAIOR.MENOR.CORREÇÃO`.
Enquanto as fases do `docs/SPEC.md` estiverem em construção, a versão fica em `0.x`: cada fase concluída sobe a versão MENOR e cada correção sobe a CORREÇÃO. A `1.0.0` marca o sistema completo em produção.

## [0.4.1] – 10/10/2026 – Ajustes da Fase 4

### Removido
- Ciente do gestor (botão, bloco "Ciente do gestor" e evento na linha do tempo). As colunas `cienteGestorPor` e `cienteGestorEm` continuam na aba `Competencias`, sem uso. A reabertura não mexe mais nesses campos.

### Alterado
- A linha do tempo não mostra mais a criação feita pela carga do histórico ("Carga inicial do histórico").

### Incluído
- `limparCompetenciaHomologacao()` / `limparSetembro2026Homologacao()`: apaga uma competência de teste na homologação; recusa rodar na produção.

## [0.4.0] – 10/10/2026 – Fase 4: SEI

### Incluído
- Tela de detalhe da competência (todos os perfis): resumo das quantidades e do ANS, pasta do Drive, linha do tempo de status (a partir do `Log`) e ciente do gestor.
- IDs do SEI (só números) e data de envio para pagamento (não futura, não anterior ao mês seguinte à competência), editáveis por fiscal técnico e superadmin até o envio.
- Transições "Iniciar instrução no SEI" (EM_CONFERENCIA → INSTRUINDO_SEI) e "Marcar como enviado para pagamento" (exige os 4 IDs e a data). Competência enviada fica bloqueada.
- Reabertura pelo superadmin com justificativa no `Log`: volta para INSTRUINDO_SEI e limpa o ciente do gestor.
- Ciente do gestor (só perfil Gestor) em competência enviada.
- Textos do atesto e do despacho (SPEC, seção 6) com botão "Copiar" que leva a formatação e a tabela para o editor do SEI; marcadores e avisos quando falta ID ou ANS.
- Destino do pagamento passou da COGECON para a ASGEC (a partir da competência 09/2026): nova chave `UNIDADE_PAGAMENTO` na aba `Config` (incluída pelo `setup()`), usada no despacho; status exibido como "Enviado para pagamento". Código interno `ENVIADA_COGECON` e coluna `dataEnvioCogecon` mantidos.
- O painel abre o detalhe da competência para todos os perfis; o lançamento ganhou o botão "Ver detalhe e SEI".
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
