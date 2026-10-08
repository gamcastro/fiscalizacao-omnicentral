# SPEC – Web App de Fiscalização Técnica do Contrato 20/2025

Versão 1 – 08/10/2026 · Responsável: George André Melo Castro (fiscal técnico titular)

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

1. Extrair os relatórios do SZ.chat (Relatórios → Premium): logins, envio em lote e mensagens passivas.
2. Apurar o ANS no Status da Fortics (fortics.statuspage.io, "View historical uptime").
3. Consolidar os 3 relatórios num PDF (`relatorio_itens_omni_<mês>_<ano>.pdf`) e salvar com o do ANS (`relatorio_ans_<mês>_<ano>.pdf`) na pasta do mês no Drive.
4. **Registrar as quantidades e o ANS neste app.** É o papel do app.
5. Conferir o saldo e o ANS. Se passar dos limites, registrar uma ocorrência e avisar o gestor.
6. Instruir o processo SEI de pagamento:
   1. Relatório de Consumo de Itens;
   2. Relatório de Cumprimento do ANS;
   3. Atesto;
   4. Despacho à COGECON.
7. Encaminhar o processo à COGECON.

O app não acessa o SEI nem o SZ.chat. Os números e os IDs do SEI são digitados.

## 2. Usuários e perfis

O superadmin cadastra todos os usuários. Quem não estiver cadastrado e ativo vê uma tela de "Acesso não autorizado" com o próprio e-mail, para pedir o cadastro.

| Perfil (código) | Quem (Portaria 7/2025) | Pode |
|---|---|---|
| `SUPERADMIN` | George André Melo Castro – george.castro@tre-ma.jus.br | Tudo, inclusive cadastrar usuários, editar configurações e reabrir competência enviada. |
| `FISCAL_TECNICO` | Titular: George André Melo Castro · Substituto: Lourencio Monteiro de Melo | Lançar e editar competências, registrar ANS e IDs do SEI, mudar status até "Enviada à COGECON", gerar textos. |
| `GESTOR` | Titular: Jaime Monteiro da Silva Júnior · Substituto: Júlio César Macêdo Dutra | Ver tudo (painel, competências, histórico). Registrar "ciente" numa competência. |
| `FISCAL_DEMANDANTE` | Titular: Fagianni Viana de Miranda · Substituto: Christiano Anderson Neitzke | Ver tudo. |
| `FISCAL_ADMINISTRATIVO` | Titular: Antoniette Conceição de Maria Freitas Coelho · Substituta: Rosinete Maria de Sousa Everton | Ver tudo. |

- Cada usuário tem um perfil e uma condição (Titular ou Substituto). O substituto tem as mesmas permissões do titular.
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
| FISCAL_TECNICO_ASSINATURA | George André Melo Castro | Nome no rodapé do atesto e do despacho |

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
| 5 | Mensagem ativa via WhatsApp (template HSM) | Mensagem | CONSUMO | Relatório de envio em lote (total, sem campanhas de teste) |
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

### 3.6 `PrecosReferencia` (somente consulta, nunca usada em cálculo)
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
`competencia` (AAAA-MM) · `vigencia` · `status` · `ansUptimePct` · `ansMinutos` · `ansCumprido` (TRUE/FALSE) · `ansObs` · `idRelConsumo` · `idRelANS` · `idAtesto` · `idDespacho` · `dataEnvioCogecon` · `pastaDrive` (URL) · `cienteGestorPor` · `cienteGestorEm` · `obs` · `criadoEm` · `criadoPor` · `atualizadoEm` · `atualizadoPor`

Status, em ordem:
1. `RASCUNHO`
2. `EM_CONFERENCIA`
3. `INSTRUINDO_SEI`
4. `ENVIADA_COGECON`

### 3.8 `Medicoes` (uma linha por competência e item)
`competencia` · `item` · `quantidade` · `quantidadeRelatorio` (valor bruto do relatório) · `ajusteObs` (ex.: "excluídas 2 msgs da campanha Teste Mudança Sessão") · `criadoEm` · `criadoPor` · `atualizadoEm` · `atualizadoPor`

### 3.9 `Log`
`timestamp` · `email` · `acao` (CRIAR/EDITAR/STATUS/USUARIO/CONFIG) · `entidade` · `chave` · `antes` (JSON) · `depois` (JSON)

### 3.10 Dados iniciais do histórico

| Competência | It.1 | It.2 | It.3 | It.4 | It.5 | ANS | IDs SEI (consumo / ANS / atesto / despacho) | Status |
|---|---|---|---|---|---|---|---|---|
| 2026-07 | 1 | ? | 1 | ? | ? | ? | ? | George informa |
| 2026-08 | 1 | 6 | 1 | 33.317 | 69.070 | 100% (0 min) | 2866941 / 2866943 / 2866955 / 2866960 – enviado em 03/09/2026 | ENVIADA_COGECON |
| 2026-09 | 1 | 7 | 1 | 6.360 | 5.213 | 99,97% (≈13 min) | pendentes | EM_CONFERENCIA |

Observações:
- 2026-09, item 5: o relatório traz 5.215, e 2 mensagens da campanha "Teste Mudança Sessão" foram excluídas.
- 2026-07: os dados ainda serão informados. Não inventar.

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
7. **Ciente do gestor:** o perfil `GESTOR` pode marcar "ciente" numa competência `ENVIADA_COGECON`. Grava nome e data, sem outro efeito.

## 5. Telas

1. **Painel (todos os perfis):**
   - Cards de saldo por item, com quantidade contratada, consumida, saldo e barra de %. Itens ≥ 80% aparecem destacados.
   - Lista de pendências e alertas.
   - Tabela das competências da vigência com status, ANS e indicador de IDs do SEI completos.
2. **Lançar / editar competência (`FISCAL_TECNICO`, `SUPERADMIN`):**
   - Mês da competência.
   - Itens 1 a 5, e eventuais recolhíveis, com campos para quantidade do relatório, quantidade medida e observação de ajuste.
   - ANS: uptime % e minutos calculados.
   - Link da pasta do Drive.
   - Botões "Salvar rascunho" e "Enviar para conferência".
3. **Detalhe da competência (todos; edição conforme o perfil):**
   - Resumo das quantidades e do ANS.
   - Linha do tempo de status.
   - Campos dos 4 IDs do SEI e da data de envio.
   - Botão "Ciente" para o gestor.
4. **Textos do SEI (dentro do detalhe):** atesto e despacho gerados (seção 6), com botão "Copiar".
5. **Histórico (todos):** todas as competências, com filtro por vigência e exportação CSV.
6. **Usuários (`SUPERADMIN`):** cadastrar, editar e ativar/desativar usuários, com perfil e condição.
7. **Configurações (`SUPERADMIN`):** editar a aba `Config`, ver vigências, quantidades e preços de referência (somente leitura na v1).

Navegação por menu lateral. O app mostra o nome e o perfil do usuário logado.

## 6. Modelos de texto (baseados nos documentos de agosto/2026, já corrigidos)

### 6.1 Atesto
```
ATESTO
Atesto, para os devidos fins, que a empresa {EMPRESA_MAIUSCULA}, inscrita no CNPJ sob o nº {CNPJ}, executou de forma satisfatória, no período de {DATA_INICIO} a {DATA_FIM}, os serviços contratados relativos ao {OBJETO_ATESTO}.
Segue discriminação:
[tabela: Item | Descrição | Unidade de Medida | Quantidade — itens 1 a 5 + eventuais com quantidade > 0]
Os serviços foram executados em conformidade com as especificações técnicas, atendendo integralmente ao ANS, conforme relatório (ID {idRelANS}), não havendo quaisquer ressalvas quanto à execução no período atestado.
{FISCAL_TECNICO_ASSINATURA}
Fiscal Técnico Contrato 20/2025
```
- Se `ansCumprido` = FALSE, a frase do ANS muda para: "Registra-se que o ANS não foi integralmente atendido no período, com {ansMinutos} minutos de indisponibilidade, conforme relatório (ID {idRelANS}), conforme ocorrência registrada."
- Se `idRelANS` estiver vazio, mostrar `[ID do Relatório de Cumprimento do ANS]` e um aviso.

### 6.2 Despacho
```
À COGECON,
Encaminho o processo para prosseguimento da análise e pagamento referente ao Contrato nº 20/2025 (OMNICENTRAL), para a competência de {DATA_INICIO} a {DATA_FIM}.
Para este fim, foram incluídos os Relatórios de Fiscalização e o Atesto de Recebimento de Serviços, conforme identificadores abaixo:
• Relatórios de Fiscalização: id {idRelConsumo} e {idRelANS}.
• Atesto de Recebimento dos Serviços: id {idAtesto}.
{FISCAL_TECNICO_ASSINATURA}
Fiscal Técnico do Contrato 20/2025
```

Os números seguem o padrão brasileiro (33.317). As datas usam dd/mm/aaaa, do primeiro ao último dia do mês.

## 7. Requisitos técnicos

- `appsscript.json`:
  - `"timeZone": "America/Sao_Paulo"`, `"runtimeVersion": "V8"`;
  - `webapp`: `"executeAs": "USER_DEPLOYING"`, `"access": "DOMAIN"`.
  - Com acesso restrito ao domínio, `Session.getActiveUser().getEmail()` retorna o e-mail de quem acessa. Confirmar no primeiro teste.
- Escopos mínimos: planilha atual e e-mail do usuário. Não pedir acesso a todo o Drive na v1.
- Todas as funções públicas do servidor começam com `requirePerfil_([...])`.
- Gravações dentro de `LockService` e registradas no `Log`.
- A função `setup()`, rodada uma vez pelo superadmin:
  - cria as abas com os cabeçalhos;
  - insere os dados iniciais da seção 3 (Config, Usuarios com o superadmin, Itens, Vigencias, QuantidadesContratadas, PrecosReferencia);
  - não apaga nada que já exista.
- Funciona bem em telas de 1366 px ou mais. No celular, basta ficar legível.

## 8. Fases de construção

1. **Fase 1 – Base:** `appsscript.json`, `setup()`, `Auth.js` (perfis), roteamento `doGet` e tela de acesso negado. Tela de Usuários do superadmin.
2. **Fase 2 – Lançamento:** tela de lançar/editar competência, cálculo do ANS, validações e Log. Carga do histórico de 2026-08 e 2026-09.
3. **Fase 3 – Painel:** saldos por item, alertas e pendências, tabela de competências.
4. **Fase 4 – SEI:** detalhe da competência, IDs, transições de status, ciente do gestor, textos do atesto e do despacho com "Copiar".
5. **Fase 5 – Extras (opcional, decidir depois):** histórico com CSV, lembrete por e-mail no 1º dia útil, leitura automática dos PDFs da pasta do mês.

Em cada fase: plano → aprovação → código → `clasp push` → roteiro de teste.

## 9. Fora do escopo

- Qualquer cálculo ou exibição de valor em reais, além da consulta da aba `PrecosReferencia`.
- Nota fiscal, empenho e pagamento.
- Integração com o SEI ou com o SZ.chat.
- Contrato 99/2024 (4D). Só pode entrar numa versão futura, então não generalizar agora sem pedido.
