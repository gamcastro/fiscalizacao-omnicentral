# Fiscalização Técnica – Contrato 20/2025 (Omnicentral)

Web App em Google Apps Script para a fiscalização técnica do Contrato TRE-MA nº 20/2025 (Omnicentral Tecnologia Ltda – plataforma omnichannel/WhatsApp). Registra, por competência mensal, as quantidades medidas, o ANS e os documentos do SEI, e mostra o saldo de quantidades da vigência.

A especificação completa está em `docs/SPEC.md`. Leia antes de qualquer mudança.

## Stack e comandos

- Google Apps Script (runtime V8), script vinculado à planilha. Há dois ambientes, cada um com sua planilha e seu script (ver abaixo).
- Front-end: HtmlService com templates (`*.html`), chamadas ao servidor via `google.script.run`.
- Desenvolvimento local com clasp 3.x. O código fica em `src/` (`rootDir`). `clasp open-script` abre o editor (o antigo `clasp open` não existe mais).

## Ambientes e fluxo de trabalho

| | Homologação | Produção |
|---|---|---|
| Branch | `homologacao` | `main` |
| Planilha | "Fiscalização Técnica – Contrato 20/2025 [HOMOLOGAÇÃO]" | "Fiscalização Técnica – Contrato 20/2025" |
| Script ID | `1ms-QRsChJFpfF5WkwFC93MkWDnj3Zv_M_oU9lmXrxZcTuvAmunvY2UuL` | `126JuJAP_a2QBzHJDL-6ObrmRBlgc_iTd69gXioQifkGko6BQipqG0VOq` |
| Config do clasp | `.clasp.json` (padrão) | `.clasp.producao.json` (sempre com `-P`) |
| URL de teste (@HEAD) | https://script.google.com/a/macros/tre-ma.jus.br/s/AKfycbwvD2-7WEXAHkvdA1pPUoEqi2vPw9jx48yrds01-IQ/dev | https://script.google.com/a/macros/tre-ma.jus.br/s/AKfycbzUz9A8WNWziWTH6zvrOUYeA5hbh3xfGWhItbEWpWLD/dev |
| URL publicada (/exec) | https://script.google.com/a/macros/tre-ma.jus.br/s/AKfycbyJVIpXMdVsZ1wxc8ujmlgjVhT9fGVePivKOjd0Di7-a5ERMQoL6iAOZfO07YMr2IjU/exec (para outras pessoas testarem; atualizar com `clasp deploy -i AKfycbyJVIpXMdVsZ1wxc8ujmlgjVhT9fGVePivKOjd0Di7-a5ERMQoL6iAOZfO07YMr2IjU -d "..."`) | https://script.google.com/a/macros/tre-ma.jus.br/s/AKfycbxepZPdDsd309OMAeWTIWE8wx4xwibnq7CRku46p6l4EIJrHLtmuOfzUYO5HiGlzBvTOQ/exec |

Fluxo:
1. Todo desenvolvimento acontece na branch `homologacao`. `clasp push` (sem `-P`) envia para a homologação. O George testa na URL de homologação. Nela pode haver dados de teste.
2. Aprovado: `git checkout main` → `git merge homologacao` → atualizar versão/CHANGELOG se ainda não estiver → commit → tag `vX.Y.Z`.
3. Ainda na `main`: `clasp -P .clasp.producao.json push` e, **só depois de perguntar ao George e ele autorizar**, `clasp -P .clasp.producao.json deploy -i <id da produção> -d "vX.Y.Z – ..."`.
4. Voltar para a `homologacao` (`git checkout homologacao` e `git merge main` se houver algo novo na main).

Regras:
- **Nunca** enviar código para a produção (`-P .clasp.producao.json`) fora da branch `main`. Conferir a branch antes (`git branch --show-current`).
- O app se identifica pelo `ScriptApp.getScriptId()`: fora do script de produção mostra a faixa "AMBIENTE DE HOMOLOGAÇÃO" (`ID_SCRIPT_PRODUCAO` em `src/Code.js`).
- Dados fictícios só na planilha de homologação. Na produção, só dados reais.
- Funções de carga (`setup`, `carregar...`) rodam primeiro na homologação; na produção só depois de validadas.

## Versionamento

- SemVer (`MAIOR.MENOR.CORREÇÃO`). Em construção fica em `0.x`: cada fase concluída sobe a MENOR (Fase 2 = `0.2.0`), cada correção sobe a CORREÇÃO. `1.0.0` = sistema completo em produção.
- A cada entrega: atualizar `VERSAO_APP` em `src/Code.js` e o `CHANGELOG.md`, fazer commit, criar a tag `vX.Y.Z` (na `main`) e implantar reaproveitando o mesmo id para a URL `/exec` não mudar.
- Implantação de produção: `AKfycbxepZPdDsd309OMAeWTIWE8wx4xwibnq7CRku46p6l4EIJrHLtmuOfzUYO5HiGlzBvTOQ` (@1 = v0.1.0, @2 = v0.2.0, @3 = v0.3.0).

## Regras de negócio que nunca podem ser quebradas

1. **Preços são só referência.** A aba de preços existe para consulta, mas nenhum cálculo, validação, painel ou texto do SEI usa valor em reais. O controle é por quantidade, ANS e IDs do SEI.
2. **Histórico começa em 07/2026** (vigência do 2º Termo Aditivo: 01/07/2026 a 30/06/2027).
3. **Itens medidos por mês:**
   - Itens 1 e 3 são fixos: quantidade 1 por mês.
   - Item 2 é o número de logins únicos no período (Relatório de logins do SZ.chat).
   - Item 4 é o total de atendimentos do Relatório de mensagens passivas.
   - Item 5 é o total do Relatório de envio em lote, **sem as campanhas de teste**. A exclusão fica registrada na observação.
   - Os itens 6 a 9 só são lançados quando houver consumo.
4. **Canal Testes** do SZ.chat fica fora da medição. O Relatório de convocação não faz parte do contrato.
5. **ANS:** no máximo 45 minutos de indisponibilidade somada no mês (99,741%). Minutos estimados = (100% − uptime%) × minutos do mês.
6. **Alerta de saldo:** avisar quando o consumo de um item na vigência chegar a 80% da quantidade contratada.
7. **Nada é apagado.** Registros são desativados ou corrigidos, e toda gravação vai para a aba `Log` com quem fez, quando, o valor antes e o depois.
8. **Permissões sempre conferidas no servidor.** O e-mail vem de `Session.getActiveUser().getEmail()` e o perfil da aba `Usuarios`. O front-end só esconde botões, nunca é a barreira de segurança.

## Convenções de código

- Interface, mensagens e nomes de abas em português (pt-BR). Datas no formato dd/mm/aaaa e competência como `AAAA-MM`. Fuso `America/Sao_Paulo`.
- Organização em `src/`:
  - `Code.js`: `doGet`, roteamento e `include()`.
  - `Auth.js`: perfis e permissões.
  - `Repo.js`: leitura e gravação nas abas.
  - `Medicoes.js`, `Usuarios.js`, `Textos.js`: regras de cada área.
  - `*.html`: telas e componentes.
- Acesso às abas sempre pelo nome do cabeçalho, nunca pelo número da coluna fixo no código.
- Gravações com `LockService.getScriptLock()`.
- Funções chamadas pelo front-end retornam objetos simples (sem `Date`; use string ISO) e erros com mensagem clara em português.
- Sem bibliotecas externas no servidor. No front-end, CSS próprio e simples, pensando em uso em desktop.

## Como trabalhar neste projeto

- Antes de implementar uma fase, apresente um plano curto e espere a aprovação.
- Construa pelas fases do `docs/SPEC.md` (seção 8), uma de cada vez, e diga como testar cada uma.
- Não mude a estrutura das abas (nomes e colunas) sem avisar. Se precisar, inclua uma função de migração.
- Não crie dados fictícios na planilha de produção. Os dados iniciais estão no SPEC, na seção 3.
- Dúvidas de regra de negócio: pergunte ao George em vez de supor.

## Pessoas e contexto

- Superadmin e fiscal técnico titular: George André Melo Castro (george.castro@tre-ma.jus.br).
- Processo SEI de pagamento: 0006617-02.2025.6.27.8000. Processo de gestão: 0016668-09.2024.6.27.8000.
- O processo mensal (BPMN) está descrito no SPEC, na seção 1.2.
