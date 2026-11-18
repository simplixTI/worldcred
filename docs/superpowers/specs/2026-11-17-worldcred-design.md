# WorldCred — Design da primeira versão (sandbox)

Data: 2026-11-17. Credor configurado: **World Serviços de Crédito LTDA — CNPJ 35.850.108/0001-58**.

## 1. Objetivo

Sistema web responsivo de originação, gestão e cobrança de crédito. Prioridade: **empréstimo fixo de ponta a ponta com mínima intervenção humana**: proposta → aceite → aprovação → desembolso Pix → confirmação → contrato ativo → parcelas → cobrança Pix → baixa por webhook → lembretes cancelados → painel atualizado.

## 2. Stack e decisões

| Tema | Decisão |
|---|---|
| Front/back | Next.js 16 (App Router, TypeScript, Tailwind 4), Server Actions e Route Handlers |
| Banco/Auth | Supabase (Postgres 17 + Auth + RLS). Projeto sandbox `worldcred-sandbox` (sa-east-1) |
| Núcleo transacional | Funções SQL `SECURITY DEFINER` (`wc_*`) para registrar pagamento, baixar parcela, cancelar lembretes, confirmar desembolso. Garantem atomicidade e idempotência no banco |
| Cálculo | Servidor, `decimal.js`; valores persistidos em **centavos inteiros**; taxas `numeric(12,8)` |
| Datas | `America/Sao_Paulo`; vencimentos como `date`; "hoje" = `(now() at time zone 'America/Sao_Paulo')::date` |
| Pix | Interface `PixProvider` (cobrança, consulta, cancelamento, pagamento de saída, consulta DICT, validação de webhook). Implementação `MockPixProvider` (sandbox, estado no banco) + esqueleto `BacenApiPixProvider` (API Pix padrão BACEN, mTLS) |
| SMS | Interface `SmsProvider`; `MockSmsProvider` (falha determinística para telefones terminados em `0000`) + esqueleto Twilio |
| Rotinas | Route handlers `/api/cron/*` protegidos por `CRON_SECRET` (`vercel.json` agenda a cada 5 min). Podem ser disparados manualmente no painel sandbox |
| MFA | TOTP do Supabase. Admin e autorização de desembolso exigem `aal2`. `MFA_ENFORCEMENT=on|off` (off só fora de produção) |
| Segredos | Somente no servidor. CPF e chave Pix mascarados em listagens; logs passam por `redact()` |

### Fora do Docker
Não há Docker na máquina, portanto o sandbox usa o projeto Supabase na nuvem. As migrations ficam em `supabase/migrations` e também são aplicadas via MCP.

## 3. Modelo de dados (resumo)

`profiles` (role admin|agent|client, active) · `lenders` · `customers` (cpf, cpf_hash, pix_key, pix_key_status) · `agent_customers` (carteira) · `products` + `product_versions` (taxa, prazos, tarifa, vigência; versão imutável) · `proposals` (snapshot do cronograma, aceite e evidência) · `contracts` (condições congeladas, credor, versão do produto) · `installments` · `disbursements` (referência única, estado, tentativas) · `pix_charges` (uma utilizável por parcela; histórico de reemissões) · `payments` · `provider_events` (idempotência por `provider+external_id`) · `reconciliation_items` · `payment_claims` ("Já paguei") · `message_queue` (único por parcela+etapa+canal) · `collection_cases` · `collection_settings` (régua D0/D+3/D+7, caso D+10, janela, pausa de conferência) · `card_operations` (modalidade desativada) · `audit_log` · `mock_pix_state` (sandbox).

## 4. Regras financeiras

- **Price** com parcelas fixas. PMT = P·i / (1 − (1+i)^−n). Arredondamento **half-up para centavos** na parcela e nos juros de cada período.
- Amortização do período = parcela − juros. **Última parcela ajustada** para que a soma das amortizações feche exatamente o principal; a diferença (poucos centavos) é documentada no snapshot (`last_installment_adjustment_cents`).
- Referência: R$ 2.000 / 10 meses / 15% a.m. → parcela regular **R$ 398,50** nas 9 primeiras e **R$ 398,58** na última (ajuste de +8 centavos para zerar o saldo; total R$ 3.985,08). Teste unitário fixa esses valores.
- Taxa anual = (1+i)^12 − 1. **CET**: TIR mensal dos fluxos (líquido recebido vs. parcelas), anualizada. Tarifa (TAC) e IOF configuráveis por versão de produto; IOF default **desligado** (enquadramento do credor a validar antes de dinheiro real).
- Vencimentos: 1ª parcela 30 dias após confirmação do desembolso (data em SP), demais no mesmo dia dos meses seguintes (limitado ao último dia do mês). Sem rolagem para dia útil nesta versão.

## 5. Fluxo principal e estados

Proposta `draft → sent → accepted → approved → contracted` (ou `rejected/declined/expired/cancelled`).
Contrato `pending_disbursement → disbursing → active → settled` (ou `cancelled`).
Desembolso `pending → authorized → sent → confirmed` (ou `failed`, `timeout` → consulta ao provedor antes de reenviar; nunca reenvia com a mesma referência sem consultar).
Parcela `open → partial → paid` (+ `in_review`, `cancelled`). Atraso é calculado, não armazenado.
Cobrança Pix `active → paid | expired | cancelled | superseded`.

## 6. Cobrança

- Fila `message_queue` com dedupe (`installment_id, stage, channel`), tentativas controladas (máx. 3, backoff), status de envio.
- Etapas padrão: D0, D+3, D+7; caso em D+10. Janela de envio padrão 08:00–20:00 SP.
- Antes de disparar: recarrega parcela; se paga/cancelada → `skipped`; se cobrança em processamento → consulta provedor; se `in_review`/caso pausado → aguarda.
- "Já paguei" cria `payment_claim`, marca `in_review`, pausa régua por `review_pause_hours` (padrão 48) ou até revisão.

## 7. Webhook e conciliação

1. Valida assinatura HMAC (`PIX_WEBHOOK_SECRET`). 2. Insere `provider_events` (único) — duplicado = `200 already_processed`. 3. Consulta status no provedor. 4. Confere referência, valor e conta recebedora. 5. Chama `wc_apply_payment` (transação): registra pagamento, atualiza saldo, cancela lembretes, fecha caso, liquida contrato se última. Divergências (parcial, maior, duplicado, sem vínculo, estorno) vão para `reconciliation_items`; ajuste manual exige admin e grava `audit_log`.

## 8. Permissões (RLS)

- Cliente: apenas seus dados (`customers.user_id = auth.uid()`).
- Agente: clientes/propostas/contratos da própria carteira (`agent_customers`) e casos atribuídos.
- Admin: tudo; escrita administrativa exige `is_admin()` e, quando `MFA_ENFORCEMENT=on`, `aal2`.
- Escritas sensíveis passam por funções `SECURITY DEFINER` chamadas pelo servidor com a chave de serviço.

## 9. Cartão (modalidade 6)

Tabela e telas criadas sob `settings.card_enabled=false`. Ativação em produção exige integração oficial (checkout hospedado/tokenização). Sem PAN/CVV no sistema. Desembolso vinculado à liquidação do parceiro e protegido por referência única. Sem parcelas Pix quando a dívida é paga na fatura.

## 10. Validação

- `tests/unit`: motor Price/CET, arredondamento, datas, máscaras.
- `tests/e2e` (contra o Supabase sandbox, chave de serviço): fluxo completo + webhook duplicado, QR expirado, pagamento parcial, falha de SMS, tempo limite de desembolso, isolamento entre carteiras.
- Painel `/sandbox` para simular eventos do provedor manualmente.
