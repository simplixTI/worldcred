# WorldCred — originação, gestão e cobrança de crédito

Sistema web responsivo (pt-BR, BRL, fuso America/Sao_Paulo) para **World Serviços de Crédito LTDA** (CNPJ 35.850.108/0001-58).
Fluxo principal: proposta → aceite → aprovação → desembolso Pix → contrato ativo → parcelas → cobrança Pix → baixa por webhook → lembretes cancelados → painel.

Stack: Next.js 16 (App Router, TypeScript, Tailwind 4, motion) · Supabase (Postgres 17, Auth, RLS, MFA TOTP) · funções SQL transacionais · provedores Pix/SMS plugáveis (mock no sandbox).

## 1. Executar em sandbox

Pré-requisitos: Node 20+ e npm. Não precisa de Docker: o sandbox usa o projeto Supabase na nuvem já provisionado (`akvmjvtwudiqcrghbfzo`, região São Paulo), com migrations e dados de demonstração aplicados.

```bash
npm install
cp .env.example .env.local
# edite .env.local e preencha SUPABASE_SERVICE_ROLE_KEY
# (Supabase Dashboard → Project Settings → API → service_role). Nunca exponha esta chave no cliente.
npm run dev
# http://localhost:3000
```

> Sem a chave de serviço o app sobe, mas as operações server-side (convite, envio de proposta, desembolso, webhook, rotinas) falham com "Variável de ambiente ausente".

### Contas de demonstração (senha `Demo@12345`)

| Perfil | E-mail | Observações |
|---|---|---|
| Administradora | admin@worldcred.demo | Exige MFA: no 1º login, cadastre o TOTP em um autenticador |
| Agente 1 | agente1@worldcred.demo | Carteira: Carla e Elisa |
| Agente 2 | agente2@worldcred.demo | Carteira: Diego |
| Cliente Carla | cliente1@worldcred.demo | Contrato ativo (R$ 2.000 / 10x): parcela 1 paga, parcela 2 vencida, chave Pix validada |
| Cliente Elisa | cliente3@worldcred.demo | Proposta R$ 5.000 aceita, aguardando aprovação do admin |
| Cliente Diego | cliente2@worldcred.demo | Proposta R$ 1.000 aguardando aceite; telefone termina em `0000` (SMS falha no simulador); sem chave Pix |

Para pular o MFA **somente em ambiente local**: `MFA_ENFORCEMENT=off` no `.env.local` **e** `update settings set value='{"mfa_enforced": false}' where key='security'` (a RLS também exige `aal2` para escrita de admin quando imposto).

### Simulador do provedor Pix

Em `/admin/sandbox` (visível com `PIX_PROVIDER=mock`): pagar integral/parcial/a maior, pagamento duplicado, conta recebedora errada, expirar QR, assinatura inválida, reenviar webhook, estorno, webhook de desembolso, rodar régua e conciliação. Cada botão dispara um evento **assinado (HMAC)** contra o webhook real `/api/webhooks/pix`.

Gatilhos determinísticos do mock: chave Pix contendo `timeout` → tempo limite no desembolso (a consulta posterior confirma); `falha` → desembolso recusado; `invalida` → chave rejeitada no DICT. Telefone terminado em `0000` → SMS falha.

### Rotinas agendadas

`vercel.json` agenda `/api/cron/collections` (a cada 5 min: enfileira lembretes D0/D+3/D+7, abre casos D+10, despacha SMS dentro da janela) e `/api/cron/reconcile` (a cada 10 min: consulta desembolsos ambíguos e expira QRs). Protegidas por `Authorization: Bearer $CRON_SECRET`. Localmente:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/collections
```

## 2. Testes

```bash
npm run test:unit   # motor Price/CET, arredondamento, datas (SP), máscaras — 19 testes
npm run test:e2e    # fluxo completo contra o sandbox; requer SUPABASE_SERVICE_ROLE_KEY
```

O E2E cobre: cadastro → proposta → isolamento RLS entre agentes → aceite via RPC autenticada → aprovação → **tempo limite no desembolso sem reenvio** → confirmação por consulta → 10 parcelas → **QR expirado substituído com histórico** → régua + **falha de SMS** → **pagamento parcial em conciliação** → baixa por webhook → **webhook duplicado** (`already_processed`/`duplicate_event`) → assinatura inválida (401) → lembretes cancelados → painel.

Os cenários do núcleo transacional também foram validados diretamente no banco (transação revertida): parcial, aplicação por conciliação, baixa total, duplicidade de evento, pagamento em parcela paga, conta recebedora divergente, sem vínculo, estorno, "Já paguei" e isolamento entre clientes.

## 3. Regras financeiras

- Tabela Price, parcelas fixas; arredondamento half-up para centavos; juros do período = saldo × taxa; **última parcela ajustada** para zerar o saldo (o ajuste é documentado no snapshot e exibido ao cliente).
- Referência: R$ 2.000 / 10 meses / 15% a.m. → 9 × **R$ 398,50** + última **R$ 398,58** (ajuste +R$ 0,08), total R$ 3.985,08. Taxa anual 435,03%; CET = TIR dos fluxos (igual à taxa quando não há tarifa/IOF).
- Valores persistidos em centavos inteiros; taxas em `numeric(12,8)`; cálculo no servidor com `decimal.js`.
- Vencimentos: 1ª parcela 30 dias após a confirmação do desembolso (data civil de SP), demais mensalmente (limitado ao fim do mês). Sem rolagem para dia útil nesta versão.
- IOF e tarifa configuráveis por versão de produto; IOF desligado por padrão (ver seção 6).

## 4. Arquitetura

```
supabase/migrations   0001 esquema · 0002 RLS · 0003 funções wc_* · 0004 correção
supabase/seed         seed.sql (gerado por scripts/gen-seed-sql.ts com o motor real)
src/lib/finance       price.ts (Price, CET/TIR), money.ts, dates.ts
src/lib/pix           types.ts · mock.ts (sandbox, estado no banco) · bacen.ts (esqueleto API Pix)
src/lib/sms           mock + esqueleto Twilio
src/lib/services      customers, proposals, disbursements, charges, webhook, collections, links, settings
src/app/agente        Novo cliente · Minhas propostas · Minha carteira · Meus casos
src/app/cliente       Proposta/aceite · Contrato · Parcela (QR, copia e cola, Já paguei) · Recibos · Chave Pix
src/app/admin         Painel · Aprovações · Desembolsos (MFA) · Fila de cobrança · Conciliação · Catálogo · Agentes · Configurações · Cartão · Auditoria · Sandbox
src/app/api           webhooks/pix · cron/collections · cron/reconcile · health
```

Núcleo transacional em SQL (`security definer`): `wc_apply_payment` (idempotente por endToEndId; confere referência, valor e conta recebedora; parcial/maior/duplicado/sem vínculo → conciliação; baixa cancela lembretes, resolve casos e liquida o contrato), `wc_confirm_disbursement` (ativa contrato e gera parcelas), `wc_enqueue_reminders` (régua com dedupe por parcela+etapa+canal), `wc_resolve_reconciliation`/`wc_link_payment` (auditados), `wc_case_action`, `wc_dashboard`.

Permissões: cliente vê só os próprios dados; agente vê a carteira (`agent_customers`) e casos atribuídos; admin vê tudo e só escreve com MFA (`aal2`) quando `settings.security.mfa_enforced=true`. Segredos ficam no servidor; CPF, chave Pix e telefone são mascarados nas listagens e redigidos nos logs/auditoria.

## 5. Produção

1. Variáveis: `PIX_PROVIDER=bacen` + credenciais/mTLS do PSP; `SMS_PROVIDER=twilio`; `MFA_ENFORCEMENT=on`; segredos fortes em `CRON_SECRET`, `PIX_WEBHOOK_SECRET`, `PORTAL_LINK_SECRET`.
2. Webhook do PSP apontando para `/api/webhooks/pix` (ajuste `verifyWebhook` em `src/lib/pix/bacen.ts` ao mecanismo do parceiro: mTLS/IP/segredo).
3. Deploy na Vercel (crons já configurados) ou outro host com agendador.

## 6. Antes de habilitar dinheiro real

- **Credor responsável**: World Serviços de Crédito LTDA (registrado em `lenders`). Validar o **enquadramento** da operação (sociedade de crédito/correspondente/ESC etc.), as **condições contratuais** e a regra de **CET** aplicável; revisar o texto de aceite exibido ao cliente.
- Confirmar com o PSP os fluxos autorizados: cobrança com txid, consulta, pagamento de saída idempotente, consulta de chave (DICT) e autenticação do webhook. Confirmar com o provedor de mensagens os canais autorizados (SMS; WhatsApp apenas com template aprovado).
- Modalidade cartão (`/admin/cartao`) permanece desativada até existir integração oficial aprovada (checkout hospedado/tokenização; sem PAN/CVV no sistema).
