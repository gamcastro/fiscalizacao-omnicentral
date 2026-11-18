# SPEC – Web App de Fiscalização Técnica do Contrato 20/2025

Versão 1 – 08/10/2026 · Atualizada em 17/11/2026 (módulo de Acompanhamento do Empenho) · Responsável: George André Melo Castro (fiscal técnico titular)

## 1. Contexto

### 1.1 Contrato

| Campo | Valor |
|---|---|
| Contrato | TRE-MA nº 20/2025 |
| Empresa | Omnicentral Tecnologia Ltda – CNPJ 23.109.142/0001-97 |
| Objeto | Licenciamento de software como serviço (SaaS) em nuvem para atendimento multicanal (omnichannel), com chatbot incorporado e integração via API |
| Licitação | Pregão Eletrônico nº 90052/2024 – TRE/CE (ata) |
| Vigência atual | 01/07/2026 a 30/06/2027 (2º Termo Aditivo, SEI doc. 2783528) |
| Reajuste vigente | Apostila nº 1 (SEI doc. 2861311, 31/08/2026) – 4,4491% ICTI, efeitos desde 01/07/2026 |
| Processo SEI de gestão | 0016668-09.2024.6.27.8000 |
| Processo SEI de pagamento | 0006617-02.2025.6.27.8000 |
| Designação | Portaria nº 7/2025 TRE-MA/PRES/DG (SEI doc. 2512849) |

### 1.2 Processo mensal (já modelado em BPMN)

Começa no 1º dia útil do mês seguinte à competência:

1. Extrair os relatórios do SZ.chat (Relatórios → Premium): logins, mensagens passivas e **todos os relatórios de mensagens ativas/template do período**. Hoje são o "Relatório de envio em lote" e o "Relatório Mensagem ativa" (título interno: "Relatório de mensagens de notificação ativa"), mas essas fontes são sazonais: podem não ter movimento no mês, mudar de nome ou surgir novas. Abrir todo relatório cujo nome tenha "ativa", "template", "notificação", "HSM" ou "envio" e baixar os que tiverem mensagens no período.
2. Apurar o ANS no Status da Fortics (fortics.statuspage.io, "View historical uptime").
3. Consolidar os relatórios de consumo num PDF (`relatorio_itens_omni_<mês>_<ano>.pdf`), nesta ordem: logins → todas as fontes de mensagens ativas → mensagens passivas, e salvar com o do ANS (`relatorio_ans_<mês>_<ano>.pdf`) na pasta do mês no Drive. Desde a v0.10.0, a montagem é feita no próprio app ("Montar relatórios do mês", no lançamento): os PDFs baixados são identificados, ordenados e juntados no navegador, sem o iLovePDF. O passo a passo do mês está no menu "Guia rápido".
4. **Registrar as quantidades e o ANS neste app.** É o papel do app.
5. Conferir o saldo e o ANS. Se passar dos limites, registrar uma ocorrência e avisar o gestor.
6. Instruir o processo SEI de pagamento:
   1. Relatório de Consumo de Itens;
   2. Relatório de Cumprimento do ANS;
   3. Atesto;
   4. Despacho à unidade de pagamento (ASGEC desde a competência 09/2026; antes, COGECON).
7. Encaminhar o processo à unidade de pagamento (ASGEC desde a competência 09/2026).

O app não acessa o SEI nem o SZ.chat. Os números e os IDs do SEI são digitados.

### 1.3 Acompanhamento do empenho (módulo separado, Fase 7)

Ao longo do ano, a fiscalização precisa saber se o saldo das notas de empenho do exercício cobre as competências até dezembro. Com essa estimativa, decide a tempo se pede **reforço** (vai faltar) ou propõe **anulação** de parte do saldo (vai sobrar).

- O módulo é separado da fiscalização técnica e é o único lugar do app com valores em reais (regra 1 do CLAUDE.md).
- O valor real vem dos documentos (NE, reforços, anulações, notas fiscais e pagamentos), digitados pelos usuários. O valor estimado de cada competência vem das quantidades medidas × preços de referência.
- O app só acompanha e projeta. O pedido de reforço ou anulação continua sendo feito no SEI, com o texto que o app gera.

## 2. Usuários e perfis

O superadmin cadastra todos os usuários. Quem não estiver cadastrado e ativo vê uma tela de "Acesso não autorizado" com o próprio e-mail, para pedir o cadastro.

| Perfil (código) | Quem (Portaria 7/2025) | Pode |
|---|---|---|
| `SUPERADMIN` | George André Melo Castro – george.castro@tre-ma.jus.br | Tudo, inclusive cadastrar usuários, editar configurações e reabrir competência enviada. |
| `FISCAL_TECNICO` | Titular: George André Melo Castro · Substituto: Lourencio Monteiro de Melo | Lançar e editar competências, registrar ANS e IDs do SEI, mudar status até "Enviado para pagamento", gerar textos. |
| `GESTOR` | Titular: Jaime Monteiro da Silva Júnior · Substituto: Júlio César Macêdo Dutra | Ver tudo (painel, competências, histórico). |
| `FISCAL_DEMANDANTE` | Titular: Fagianni Viana de Miranda · Substituto: Christiano Anderson Neitzke | Ver tudo. |
| `FISCAL_ADMINISTRATIVO` | Titular: Antoniette Conceição de Maria Freitas Coelho · Substituta: Rosinete Maria de Sousa Everton | Ver tudo. |

- Cada usuário tem um perfil e uma condição (Titular ou Substituto). O substituto tem as mesmas permissões do titular.
- **Módulo de Acompanhamento do Empenho (Fase 7):** `SUPERADMIN`, `FISCAL_TECNICO` e `GESTOR` veem e lançam (empenhos, reforços, anulações, pagamentos e previsões). `FISCAL_DEMANDANTE` e `FISCAL_ADMINISTRATIVO` não veem o módulo nem o card de empenho do painel.
- Os e-mails dos demais serão informados pelo superadmin na tela de usuários. Não preencher com e-mails supostos.

## 3. Modelo de dados (abas da planilha)

Linha 1 de cada aba é o cabeçalho. O código lê as colunas pelo nome do cabeçalho.

### 3.1 `Config`
| chave | valor | descricao |
|---|---|---|
| CONTRATO | 20/2025 | |
| EMPRESA | Omnicentral Tecnologia Ltda | |
| CNPJ | 23.109.142/0001-97 | |
| OBJETO_ATESTO | licenciamento de uso de software como serviço (SaaS) em ambiente de nuvem para atendimento multicanal (omnichannel), com chatbot incorporado e integração via API | Usado no texto do atesto |
| VIGENCIA_ATUAL | V2026 | id da aba Vigencias |
| ANS_LIMITE_MIN | 45 | |
| ANS_PERCENTUAL | 99,741 | Referência do TR |
| ALERTA_SALDO | 0,8 | 80% |
| SEI_PAGAMENTO | 0006617-02.2025.6.27.8000 | |
| EMAILS_LEMBRETE | george.castro@tre-ma.jus.br | Destinatários do lembrete do 1º dia útil e do aviso de prazo dos documentos SEI, separados por ";" (v0.6.0) |
| UNIDADE_PAGAMENTO | ASGEC | Destinatária do despacho de pagamento. ASGEC desde a competência 09/2026; antes, COGECON (mudança informada em 10/10/2026) |
| FISCAL_TECNICO_ASSINATURA | George André Melo Castro | Nome no rodapé do atesto e do despacho |
| EMPENHO_EXERCICIO | 2026 | Exercício aberto por padrão na tela de empenho (Fase 7) |
| EMPENHO_MARGEM | 0,10 | Margem de segurança da projeção (10%) |
| EMPENHO_DATA_LIMITE | (vazio) | Data-limite do setor de orçamento para pedir reforço ou anulação no exercício. George informa |
| EMPENHO_AVISO_DIAS | 15 | Dias antes da data-limite em que o painel e o lembrete passam a avisar |
| EMPENHO_TOLERANCIA_NF | 1,00 | Diferença em reais entre valor da NF e valor estimado acima da qual o app alerta |
| EMPENHO_UNIDADE_DESTINO | (vazio) | Unidade destinatária do despacho de reforço/anulação. George informa |

### 3.2 `Usuarios`
`email` · `nome` · `perfil` · `condicao` (Titular/Substituto) · `ativo` (TRUE/FALSE) · `criadoEm` · `criadoPor` · `atualizadoEm` · `atualizadoPor`

Linha inicial: george.castro@tre-ma.jus.br · George André Melo Castro · SUPERADMIN · Titular · TRUE.

### 3.3 `Itens`
| item | descricao | unidade | tipo | fonte |
|---|---|---|---|---|
| 1 | Subscrição WhatsApp API Oficial (BSP) | Assinatura mensal | FIXO | — |
| 2 | Solução de atendimento humano com mensagens ilimitadas | Ativação/mês | CONSUMO | Relatório de logins (e-mails únicos no período) |
| 3 | Serviço de atendimento por chatbot com interações ilimitadas | Assinatura mensal | FIXO | — |
| 4 | Mensagem passiva de atendimento via WhatsApp | Conversa 24h | CONSUMO | Relatório de mensagens passivas (total de atendimentos) |
| 5 | Mensagem ativa via WhatsApp (template HSM) | Mensagem | CONSUMO | Soma das fontes de mensagens ativas do mês, sem campanhas de teste (ver 3.11 e 3.12) |
| 6 | Pacote adicional de videochamadas simultâneas (+5 agentes) | Pacote | EVENTUAL | — |
| 7 | Serviço de integração e desenvolvimento | Hora | EVENTUAL | — |
| 8 | Serviço de implantação e configuração | Serviço | EVENTUAL | — |
| 9 | Serviço de treinamento | Serviço | EVENTUAL | — |

- Os itens 1 a 5 aparecem sempre no lançamento e no atesto.
- Os itens 6 a 9 aparecem no lançamento numa seção "Itens eventuais" e só entram no atesto quando a quantidade for maior que 0.

### 3.4 `Vigencias`
| id | inicio | fim | documento | observacao |
|---|---|---|---|---|
| V2026 | 01/07/2026 | 30/06/2027 | 2º Termo Aditivo (SEI 2783528) | Reajuste pela Apostila nº 1 (SEI 2861311) |

### 3.5 `QuantidadesContratadas`
| vigencia | item | qtdContratada |
|---|---|---|
| V2026 | 1 | 12 |
| V2026 | 2 | 3400 |
| V2026 | 3 | 12 |
| V2026 | 4 | 400000 |
| V2026 | 5 | 500000 |
| V2026 | 6 | 5 |
| V2026 | 7 | 720 |
| V2026 | 8 | 1 |
| V2026 | 9 | 1 |

### 3.6 `PrecosReferencia` (consulta na fiscalização técnica; usada em cálculo **somente** no módulo de empenho)
| vigencia | item | valorUnitario | documento |
|---|---|---|---|
| V2026 | 1 | 547,91 | Apostila nº 1 |
| V2026 | 2 | 54,791 | Apostila nº 1 |
| V2026 | 3 | 2.410,80 | Apostila nº 1 |
| V2026 | 4 | 0,23012207 | Apostila nº 1 |
| V2026 | 5 | 0,10958194 | Apostila nº 1 |
| V2026 | 6 | 109,58 | Apostila nº 1 |
| V2026 | 7 | 53,695 | Apostila nº 1 |
| V2026 | 8 | 5.479,05 | Apostila nº 1 |
| V2026 | 9 | 1.095,80 | Apostila nº 1 |

### 3.7 `Competencias` (uma linha por mês)
`competencia` (AAAA-MM) · `vigencia` · `status` · `ansUptimePct` · `ansMinutos` · `ansCumprido` (TRUE/FALSE) · `ansObs` · `idRelConsumo` · `idRelANS` · `idAtesto` · `idDespacho` · `dataEnvioCogecon` · `pastaDrive` (URL) · `cienteGestorPor` · `cienteGestorEm` (sem uso desde a v0.4.1) · `obs` · `criadoEm` · `criadoPor` · `atualizadoEm` · `atualizadoPor`

Status, em ordem:
1. `RASCUNHO`
2. `EM_CONFERENCIA`
3. `INSTRUINDO_SEI`
4. `ENVIADA_COGECON` (rótulo na tela: "Enviado para pagamento". O código interno e a coluna `dataEnvioCogecon` foram mantidos quando o destino passou a ser a ASGEC.)

### 3.8 `Medicoes` (uma linha por competência e item)
`competencia` · `item` · `quantidade` · `quantidadeRelatorio` (valor bruto do relatório) · `ajusteObs` (ex.: "excluídas 2 msgs da campanha Teste Mudança Sessão") · `criadoEm` · `criadoPor` · `atualizadoEm` · `atualizadoPor`

### 3.9 `Log`
`timestamp` · `email` · `acao` (CRIAR/EDITAR/STATUS/USUARIO/CONFIG/EXCLUIR/LEMBRETE/DESATIVAR) · `entidade` · `chave` · `antes` (JSON) · `depois` (JSON)

Gravações do módulo de empenho usam as mesmas ações, com `entidade` = `Empenhos`, `EmpenhoMovimentos`, `Pagamentos` ou `EmpenhoPrevisoes`.

### 3.10 Dados iniciais do histórico

| Competência | It.1 | It.2 | It.3 | It.4 | It.5 | ANS | IDs SEI (consumo / ANS / atesto / despacho) | Status |
|---|---|---|---|---|---|---|---|---|
| 2026-07 | 1 | ? | 1 | ? | ? | ? | ? | George informa |
| 2026-08 | 1 | 6 | 1 | 33.317 | 69.070 | 100% (0 min) | 2866941 / 2866943 / 2866955 / 2866960 – enviado em 03/09/2026 | ENVIADA_COGECON |
| 2026-09 | 1 | 7 | 1 | 6.360 | 5.215 | 99,97% (≈13 min) | pendentes | EM_CONFERENCIA |

Observações:
- 2026-09, item 5: o relatório traz 5.215, e o atesto assinado em 10/10/2026 considerou 5.215 (as 2 mensagens da campanha "Teste Mudança Sessão" não foram excluídas). Decisão do fiscal técnico em 08/11/2026: vale o que foi atestado.
- 2026-10, item 5 = 35.878: "Relatório de envio em lote" 349 + "Relatório Mensagem ativa" 35.529. Item 2 = 5 (inclui o login de fagianni.miranda@tre-ma.jus.br, que conta normalmente).
- O detalhamento do item 5 por fonte fica na aba `MedicaoFontes` (3.12). Carga inicial dessa aba:
  - 2026-08: "Relatório de envio em lote" – bruto 69.070, considerado 69.070.
  - 2026-09: "Relatório de envio em lote" – bruto 5.215, sem exclusão, considerado 5.215.
  - 2026-10: "Relatório de envio em lote" 349 e "Relatório Mensagem ativa" 35.529.
- 2026-07: os dados ainda serão informados. Não inventar.

### 3.11 `FontesRelatorio` (catálogo de fontes por item)
`id` · `item` · `nome` (como aparece na lista de Relatórios Premium) · `tituloInterno` (título dentro do relatório, opcional) · `ativo` (TRUE/FALSE) · `criadoEm` · `criadoPor` · `atualizadoEm` · `atualizadoPor`

Linhas iniciais:
| id | item | nome | tituloInterno | ativo |
|---|---|---|---|---|
| F-ENVIO-LOTE | 5 | Relatório de envio em lote | Relatório de envio em lote | TRUE |
| F-MSG-ATIVA | 5 | Relatório Mensagem ativa | Relatório de mensagens de notificação ativa | TRUE |

- Fonte nova informada como "Outro" no lançamento pode ser incluída no catálogo pelo `FISCAL_TECNICO` ou `SUPERADMIN` (com confirmação), para padronizar o nome nos meses seguintes.
- Fonte que deixou de existir é desativada (`ativo` = FALSE), nunca apagada.

### 3.12 `MedicaoFontes` (detalhe do item 5 por fonte; uma linha por competência, item e fonte)
`competencia` · `item` · `fonteId` (id do catálogo ou vazio quando "Outro") · `fonteNome` (nome gravado no momento do lançamento) · `quantidadeBruta` · `exclusoes` (quantidade excluída) · `exclusoesObs` (ex.: "campanha Teste Mudança Sessão") · `quantidadeConsiderada` (= bruta − exclusões) · `criadoEm` · `criadoPor` · `atualizadoEm` · `atualizadoPor`

- Na aba `Medicoes`, o item 5 continua com uma linha só: `quantidade` = soma de `quantidadeConsiderada`, `quantidadeRelatorio` = soma de `quantidadeBruta`. O `ajusteObs` resume as exclusões.
- O modelo serve para qualquer item, mas na v atual só o item 5 usa fontes múltiplas.

### 3.13 `Empenhos` (uma linha por nota de empenho; módulo de empenho)
`id` (número da NE, ex.: 2026NE000333) · `exercicio` (AAAA) · `dataEmissao` · `valorInicial` · `idSei` (documento da NE no SEI, opcional) · `obs` · `ativo` (TRUE/FALSE) · `criadoEm` · `criadoPor` · `atualizadoEm` · `atualizadoPor`

- O contrato pode ter várias NEs no mesmo exercício (hoje 2026NE000333 e 2026NE000334), **sem regra de divisão** entre elas: cada pagamento indica de qual NE saiu.
- Sem carga inicial: os usuários lançam pela tela quando o módulo estiver pronto.
- NE lançada por engano é desativada (`ativo` = FALSE), nunca apagada.

### 3.14 `EmpenhoMovimentos` (reforços e anulações)
`id` (gerado, ex.: MOV-0001) · `empenhoId` · `tipo` (REFORCO/ANULACAO) · `data` · `valor` (sempre positivo; o tipo define o sinal) · `idSei` · `obs` · `ativo` · `criadoEm` · `criadoPor` · `atualizadoEm` · `atualizadoPor`

### 3.15 `Pagamentos` (o que foi faturado e pago, por competência e NE)
`id` (gerado, ex.: PAG-0001) · `competencia` (AAAA-MM) · `empenhoId` · `tipo` (MENSAL/RETROATIVO/OUTRO) · `numeroNF` · `dataNF` · `valorNF` · `situacao` (A_PAGAR/PAGO) · `valorPago` · `dataPagamento` · `idSei` · `obs` · `ativo` · `criadoEm` · `criadoPor` · `atualizadoEm` · `atualizadoPor`

- Uma competência pode ter mais de uma linha (por exemplo, paga com duas NEs, ou uma diferença de reajuste lançada como `RETROATIVO`).
- `situacao` = PAGO exige `valorPago` e `dataPagamento`.
- O `exercicio` do pagamento é o da NE usada.

### 3.16 `EmpenhoPrevisoes` (ajuste manual da projeção)
`exercicio` · `competencia` · `item` · `quantidadePrevista` · `obs` (obrigatória, ex.: "eleição suplementar de Nova Olinda") · `ativo` · `criadoEm` · `criadoPor` · `atualizadoEm` · `atualizadoPor`

- Serve para mês com evento conhecido (eleição suplementar, campanha de notificação, item eventual 6 a 9 previsto). Substitui a quantidade projetada daquele item naquele mês nos três cenários.

## 4. Regras de negócio

1. **Competência única:** uma linha por mês em `Competencias`. A competência precisa estar dentro de uma vigência cadastrada.
2. **Quantidades:** números inteiros ≥ 0. Os itens 1 e 3 vêm com 1 por padrão. Se `quantidade` for diferente de `quantidadeRelatorio`, `ajusteObs` é obrigatória.
3. **ANS:** `ansMinutos` = arredondar((100 − uptime%) / 100 × minutos do mês). `ansCumprido` = `ansMinutos` ≤ `ANS_LIMITE_MIN`. O usuário pode corrigir os minutos à mão, com observação.
4. **Saldo da vigência por item:** contratado − soma das quantidades das competências da vigência. % consumido = soma / contratado.
5. **Alertas no painel e na hora de salvar:**
   - % consumido ≥ `ALERTA_SALDO`;
   - ANS não cumprido;
   - competência do mês anterior ainda não lançada a partir do 1º dia útil;
   - competência sem os 4 IDs do SEI depois de 10 dias úteis.
6. **Transições de status:**
   - `RASCUNHO` → `EM_CONFERENCIA`: exige os itens 1 a 5 e o ANS preenchidos.
   - `EM_CONFERENCIA` → `INSTRUINDO_SEI`: sem exigência extra.
   - `INSTRUINDO_SEI` → `ENVIADA_COGECON`: exige os 4 IDs do SEI e `dataEnvioCogecon`.
   - Depois de `ENVIADA_COGECON`, a competência fica bloqueada. Só o `SUPERADMIN` reabre, com justificativa no Log.
7. ~~**Ciente do gestor**~~: retirado em 10/10/2026 (v0.4.1), a pedido do fiscal técnico titular. As colunas `cienteGestorPor` e `cienteGestorEm` continuam na aba, sem uso.
8. **Item 5 por fontes:**
   - o total do item 5 é sempre a soma das `quantidadeConsiderada` das fontes da competência;
   - uma competência pode ter 0, 1 ou mais fontes; com 0 fontes o item 5 fica 0, e o app pede confirmação explícita ("Não houve mensagens ativas no período");
   - não pode haver a mesma fonte duas vezes na mesma competência;
   - `exclusoes` > 0 exige `exclusoesObs`;
   - **trava de conferência:** ao passar de `RASCUNHO` para `EM_CONFERENCIA` com uma única fonte (ou nenhuma), o app exige marcar "Confirmo que verifiquei todos os relatórios de mensagens ativas/template do período em Relatórios Premium". A confirmação vai para o Log.
9. **Acompanhamento do empenho (só no módulo de empenho):**
   - **Competências do exercício:** os meses de janeiro a dezembro do exercício que estejam dentro de uma vigência cadastrada (em 2026: julho a dezembro). A competência de dezembro é paga em janeiro, mas conta no exercício em que foi prestada.
   - **Valor estimado da competência** = soma, por item, de quantidade × `valorUnitario` da `PrecosReferencia` da vigência daquela competência, arredondado a 2 casas por item. Se o exercício tiver duas vigências (ex.: 2027), cada mês usa o preço da sua vigência.
   - **Empenhado líquido** = soma dos `valorInicial` das NEs ativas do exercício + reforços − anulações.
   - **Pago** = soma de `valorPago` dos pagamentos PAGO do exercício. **A pagar** = soma de `valorNF` dos pagamentos A_PAGAR.
   - **Comprometido estimado** = valor estimado das competências do exercício com medição lançada e sem pagamento registrado.
   - **Saldo disponível** = empenhado líquido − pago − a pagar − comprometido estimado.
   - **Necessidade futura** = competências do exercício ainda sem medição, até dezembro, em três cenários:
     - parte fixa: itens 1 e 3 (quantidade 1 × preço);
     - itens 2, 4 e 5: **mínimo** = menor quantidade mensal já medida na vigência; **provável** = mediana das quantidades medidas na vigência; **máximo** = maior quantidade medida;
     - itens 6 a 9: só entram por previsão manual;
     - previsão manual (`EmpenhoPrevisoes`) substitui o item naquele mês nos três cenários;
     - competência anterior sem medição e sem pagamento (ex.: 2026-07) aparece com o aviso "sem dados" e entra na projeção como mês futuro.
   - **Resultado por cenário** = saldo disponível − necessidade futura do cenário.
   - **Indicação** (usa a margem `EMPENHO_MARGEM`):
     - **solicitar reforço** quando o saldo disponível for menor que a necessidade futura provável × (1 + margem); valor sugerido = a diferença, arredondada para cima em centenas de reais;
     - **avaliar anulação** quando, mesmo no cenário máximo × (1 + margem), ainda sobrar saldo; valor sugerido = a sobra, arredondada para baixo em centenas de reais;
     - caso contrário, **saldo adequado**.
   - **Conferência da NF:** se `valorNF` (MENSAL) diferir do valor estimado da competência em mais de `EMPENHO_TOLERANCIA_NF`, o app mostra alerta com a diferença. Não bloqueia.
   - **Prazo:** com `EMPENHO_DATA_LIMITE` preenchida, o card do painel e o lembrete por e-mail avisam a partir de `EMPENHO_AVISO_DIAS` antes da data, junto com a indicação atual.
   - **Nada é apagado:** NEs, movimentos, pagamentos e previsões são corrigidos ou desativados, sempre com Log (regra 7).
   - Valores em reais no formato brasileiro (R$ 1.234,56).

## 5. Telas

1. **Painel (todos os perfis):**
   - Cards de saldo por item, com quantidade contratada, consumida, saldo e barra de %. Itens ≥ 80% aparecem destacados.
   - Lista de pendências e alertas.
   - Tabela das competências da vigência com status, ANS e indicador de IDs do SEI completos.
   - Card "Empenho {exercício}" (só `SUPERADMIN`, `FISCAL_TECNICO` e `GESTOR`): saldo disponível, indicação (reforço / anulação / adequado) e aviso de prazo. Leva à tela de empenho.
2. **Lançar / editar competência (`FISCAL_TECNICO`, `SUPERADMIN`):**
   - Mês da competência.
   - Itens 1 a 4, e eventuais recolhíveis, com campos para quantidade do relatório, quantidade medida e observação de ajuste.
   - **Item 5 como lista de fontes:** cada linha tem fonte (lista do catálogo ativo + "Outro (informar nome)"), quantidade bruta, exclusões e observação. Botão "+ Adicionar fonte" e botão de remover linha. O total do item 5 é recalculado na hora e aparece em destaque. Ao salvar uma fonte "Outro", o app oferece incluí-la no catálogo.
   - ANS: uptime % e minutos calculados.
   - Link da pasta do Drive.
   - Botões "Salvar rascunho" e "Enviar para conferência".
3. **Detalhe da competência (todos; edição conforme o perfil):**
   - Resumo das quantidades e do ANS, com as parcelas do item 5 por fonte.
   - Linha do tempo de status.
   - Campos dos 4 IDs do SEI e da data de envio.
4. **Textos do SEI (dentro do detalhe):** atesto e despacho gerados (seção 6), com botão "Copiar".
5. **Histórico (todos):** todas as competências, com filtro por vigência e exportação CSV.
6. **Usuários (`SUPERADMIN`):** cadastrar, editar e ativar/desativar usuários, com perfil e condição.
7. **Configurações (`SUPERADMIN`):** editar a aba `Config`; cadastrar, editar e excluir feriados e vigências com as quantidades contratadas; ligar/desligar o lembrete por e-mail; consultar os preços de referência (somente leitura). Implementado na v0.7.0.

8. **Acompanhamento do Empenho (`SUPERADMIN`, `FISCAL_TECNICO`, `GESTOR`):**
   - Seletor de exercício (padrão `EMPENHO_EXERCICIO`).
   - Cards: empenhado líquido; pago; a pagar + comprometido; saldo disponível; necessidade futura (mínimo / provável / máximo); indicação com valor sugerido e data-limite.
   - Tabela mês a mês do exercício: competência, quantidades-resumo, valor estimado, NF, valor pago, NE usada, situação e diferença NF × estimado.
   - Cadastros na própria tela: notas de empenho (com reforços e anulações), pagamentos e previsões manuais, com editar e desativar.
   - Texto do despacho de reforço ou anulação (seção 6.3) com botão "Copiar".

Navegação por menu lateral. O app mostra o nome e o perfil do usuário logado. O item de menu "Empenho" só aparece para os três perfis do módulo.

## 6. Modelos de texto (baseados nos documentos de agosto/2026, já corrigidos)

### 6.1 Atesto
```
Atesto, para os devidos fins, que a empresa {EMPRESA_MAIUSCULA}, inscrita no CNPJ sob o nº {CNPJ}, executou de forma satisfatória, no período de {DATA_INICIO} a {DATA_FIM}, os serviços contratados relativos ao {OBJETO_ATESTO}.
Segue discriminação:
[tabela: Item | Descrição | Unidade de Medida | Quantidade — itens 1 a 5 + eventuais com quantidade > 0]
Os serviços foram executados em conformidade com as especificações técnicas, atendendo integralmente ao ANS, conforme relatório (ID {idRelANS}), não havendo quaisquer ressalvas quanto à execução no período atestado.
{FISCAL_TECNICO_ASSINATURA}
Fiscal Técnico Contrato 20/2025
```
- O texto não leva o título "ATESTO": o tipo de documento Atesto do SEI já traz o título (decisão de 10/10/2026).
- Se `ansCumprido` = FALSE, a frase do ANS muda para: "Registra-se que o ANS não foi integralmente atendido no período, com {ansMinutos} minutos de indisponibilidade, conforme relatório (ID {idRelANS}), conforme ocorrência registrada."
- Se `idRelANS` estiver vazio, mostrar `[ID do Relatório de Cumprimento do ANS]` e um aviso.

### 6.2 Despacho
```
À {UNIDADE_PAGAMENTO},
Encaminho o processo para prosseguimento da análise e pagamento referente ao Contrato nº 20/2025 (OMNICENTRAL), para a competência de {DATA_INICIO} a {DATA_FIM}.
Para este fim, foram incluídos os Relatórios de Fiscalização e o Atesto de Recebimento de Serviços, conforme identificadores abaixo:
• Relatórios de Fiscalização: id {idRelConsumo} e {idRelANS}.
• Atesto de Recebimento dos Serviços: id {idAtesto}.
{FISCAL_TECNICO_ASSINATURA}
Fiscal Técnico do Contrato 20/2025
```

### 6.3 Despacho de reforço ou anulação de empenho (só no módulo de empenho)
```
À {EMPENHO_UNIDADE_DESTINO},
Em acompanhamento da execução orçamentária do Contrato nº 20/2025 (OMNICENTRAL), informo a situação das Notas de Empenho do exercício de {EXERCICIO} ({LISTA_NES}):
• Valor empenhado: R$ {EMPENHADO}.
• Valor pago: R$ {PAGO}.
• Valor a pagar e comprometido com competências já medidas: R$ {A_PAGAR_COMPROMETIDO}.
• Estimativa para as competências de {MESES_RESTANTES}: R$ {NECESSIDADE_PROVAVEL} (mínimo de R$ {NECESSIDADE_MIN} e máximo de R$ {NECESSIDADE_MAX}).
[se reforço] Diante disso, solicito o reforço de R$ {VALOR} na Nota de Empenho {NE_ESCOLHIDA}, para garantir o pagamento das competências até dezembro de {EXERCICIO}.
[se anulação] Diante disso, informo que há saldo estimado excedente e sugiro a anulação de R$ {VALOR} da Nota de Empenho {NE_ESCOLHIDA}.
A estimativa considera as quantidades medidas pela fiscalização e os preços unitários vigentes ({DOCUMENTO_PRECOS}), com margem de segurança de {MARGEM}%.
{NOME_USUARIO}
{FUNCAO_USUARIO} do Contrato 20/2025
```
- O usuário escolhe na tela o tipo (reforço ou anulação), a NE e pode ajustar o valor sugerido antes de copiar.
- `{FUNCAO_USUARIO}`: "Gestor" para `GESTOR` e "Fiscal Técnico" para `FISCAL_TECNICO` e `SUPERADMIN`.
- Se `EMPENHO_UNIDADE_DESTINO` estiver vazia, mostrar `[unidade destinatária]` e um aviso.

Os números seguem o padrão brasileiro (33.317). As datas usam dd/mm/aaaa, do primeiro ao último dia do mês.

## 7. Requisitos técnicos

- `appsscript.json`:
  - `"timeZone": "America/Sao_Paulo"`, `"runtimeVersion": "V8"`;
  - `webapp`: `"executeAs": "USER_DEPLOYING"`, `"access": "DOMAIN"`.
  - Com acesso restrito ao domínio, `Session.getActiveUser().getEmail()` retorna o e-mail de quem acessa. Confirmar no primeiro teste.
- Escopos: planilha atual e e-mail do usuário (v1); envio de e-mail e gatilhos (v0.6.0, lembrete); leitura do Drive, arquivos criados pelo app e Google Docs (v0.9.0, leitura dos PDFs – ampliação aprovada pelo fiscal técnico em 08/11/2026). O documento temporário de conversão é apagado logo após a leitura.
- Todas as funções públicas do servidor começam com `requirePerfil_([...])`.
- Gravações dentro de `LockService` e registradas no `Log`.
- A função `setup()`, rodada uma vez pelo superadmin:
  - cria as abas com os cabeçalhos;
  - insere os dados iniciais da seção 3 (Config, Usuarios com o superadmin, Itens, Vigencias, QuantidadesContratadas, PrecosReferencia);
  - a partir da Fase 7, cria também `Empenhos`, `EmpenhoMovimentos`, `Pagamentos` e `EmpenhoPrevisoes` (só cabeçalhos) e as chaves `EMPENHO_*` da `Config` que faltarem;
  - não apaga nada que já exista.
- Funciona bem em telas de 1366 px ou mais. No celular, basta ficar legível.

## 8. Fases de construção

1. **Fase 1 – Base:** `appsscript.json`, `setup()`, `Auth.js` (perfis), roteamento `doGet` e tela de acesso negado. Tela de Usuários do superadmin.
2. **Fase 2 – Lançamento:** tela de lançar/editar competência, cálculo do ANS, validações e Log. Carga do histórico de 2026-08 e 2026-09.
3. **Fase 3 – Painel:** saldos por item, alertas e pendências, tabela de competências.
4. **Fase 4 – SEI:** detalhe da competência, IDs, transições de status, textos do atesto e do despacho com "Copiar".
5. **Fase 5 – Extras:** histórico com CSV (v0.5.0), lembrete por e-mail no 1º dia útil (v0.6.0) e leitura automática dos PDFs da pasta do mês (v0.9.0: o botão "Ler PDFs da pasta" no lançamento sugere itens 2 e 4, fontes do item 5 e uptime do ANS, com o trecho de origem; nada é gravado sem conferência; campanhas com "teste" no nome são só destacadas).

6. **Fase 6 – Fontes variáveis do item 5 (pedida em 05/11/2026):**
   - criar as abas `FontesRelatorio` e `MedicaoFontes` pelo `setup()` (sem apagar nada) e carregar o catálogo e o histórico da seção 3.10;
   - trocar o campo único do item 5 pela lista de fontes na tela de lançamento;
   - regra 8 da seção 4 (soma, duplicidade, exclusões, trava de conferência);
   - parcelas por fonte no detalhe da competência; o atesto continua só com o total do item 5;
   - competências já lançadas continuam válidas: se não tiverem linhas em `MedicaoFontes`, mostrar o total da aba `Medicoes` com o aviso "sem detalhamento por fonte".

7. **Fase 7 – Acompanhamento do Empenho (pedida em 17/11/2026):**
   - criar as abas 3.13 a 3.16 e as chaves `EMPENHO_*` pelo `setup()`, sem apagar nada;
   - `Empenho.js` com a regra 9 e as permissões (`SUPERADMIN`, `FISCAL_TECNICO`, `GESTOR` veem e lançam; demais perfis negados no servidor);
   - tela "Acompanhamento do Empenho" (seção 5, tela 8), card no painel e texto 6.3;
   - aviso de prazo no painel e no lembrete por e-mail;
   - **não alterar** nenhuma tela, texto ou aba da fiscalização técnica, a não ser o card do painel e o item de menu;
   - sem carga inicial: os dados reais são lançados pela tela, primeiro na homologação (dados de teste) e depois na produção;
   - roteiro de teste com um exercício fictício na homologação cobrindo os três resultados (reforço, anulação e adequado) e o acesso negado para `FISCAL_DEMANDANTE`;
   - prioridade: a decisão de reforço ou anulação de 2026 depende deste módulo.
   - decisões de 17/11/2026: competência em qualquer status (inclusive rascunho) conta como medida; vigência sem meses medidos usa a vigência anterior, com aviso; o bloco do empenho no e-mail vai só para destinatários com acesso ao módulo; o aviso de prazo sai ao entrar na janela, 3 dias úteis antes e no dia; as chaves `EMPENHO_*` são editadas pelo superadmin dentro da tela do empenho (não nas Configurações); pagamento maior que o saldo da NE ou anulação que deixa a NE negativa só geram aviso;
   - implementada na v0.11.0 (entregue junto com a v0.10.0).
   - acréscimo de 18/11/2026: importação da NE pelo PDF do SIAFI ("Impressão Completa"). O app lê número, data de emissão e operações dos itens; valor inicial = soma das "Inclusão" e cada "Reforço"/"Anulação" vira um movimento (somado por dia). Prévia antes de gravar, ID SEI informado à mão, favorecido conferido pelo CNPJ da `Config`, PDF não guardado. Na reimportação só entra o que é novo; divergência com o que já está cadastrado só gera aviso. Entra na mesma v0.11.0.
   - acréscimo de 18/11/2026: importação do pagamento pela NFS-e e pela OB do SIAFI. O app preenche o formulário de pagamento (o fiscal confere e salva); valor da NF e valor pago = valor total (bruto) da NF, porque as retenções também saem da NE; a OB confirma o pagamento, a data e a NE. Só a NF → a pagar; só a OB de NF já lançada → edição daquele pagamento. Divergências só geram aviso. Entra na mesma v0.11.0.

Em cada fase: plano → aprovação → código → `clasp push` → roteiro de teste.

## 9. Fora do escopo

- Qualquer cálculo ou exibição de valor em reais **fora do módulo de Acompanhamento do Empenho** (na fiscalização técnica, preços só para consulta).
- Emitir, reforçar ou anular empenho no SIAFI e qualquer integração com sistemas financeiros ou orçamentários. O app só acompanha e projeta; os pedidos seguem pelo SEI.
- Integração com o SEI ou com o SZ.chat.
- Contrato 99/2024 (4D). Só pode entrar numa versão futura, então não generalizar agora sem pedido.
