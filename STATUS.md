# WorldCred — STATUS do projeto

Atualizado em 2026-11-23. Credor: **World Serviços de Crédito LTDA — CNPJ 35.850.108/0001-58**.
Produção: **https://worldcred.digital** (Vercel, deploy automático a cada push em `main`). Repositório: https://github.com/simplixTI/worldcred.

---

## 1. Como a operação funciona hoje

| Papel | O que faz | Onde |
|---|---|---|
| **Cliente** | Entra no site, simula, faz o cadastro em 3 passos (valor/prazo → dados com consulta de CPF + **ID do agente** → e-mail/senha), lê e aceita a proposta, cadastra a chave Pix, paga parcelas por QR Pix, pede novo crédito, contrata crédito com cartão | `/`, `/cadastro`, `/cliente/*` |
| **Agente** | Só **indica**. Tem um ID (ex.: `WC1001`) e um link `worldcred.digital/cadastro?ref=WC1001`. Vê a situação dos indicados. Não cadastra cliente nem monta proposta | `/agente` |
| **Admin** | Aprova propostas, autoriza desembolso Pix, acompanha painel (caixa, carteira a receber, atrasos), fila de cobrança, conciliação, catálogo, agentes, configurações, cartão, leads | `/admin/*` |
| **DEV** (só Bruno) | Ambiente, auditoria, eventos de provedor, sandbox | `/dev/*` (controlado por `DEV_EMAILS`) |

Fluxo do crédito padrão: cadastro → proposta gerada → **aceite** no portal (evidência: IP, hash do texto, data) → **aprovação** (admin) → **desembolso Pix** (admin autoriza; referência única) → contrato ativo + 10 parcelas → **cobrança Pix** por parcela (QR real) → **baixa automática** por webhook → lembretes cancelados → painel atualizado.

---

## 2. O que está pronto e validado

### Núcleo financeiro
- Tabela Price, parcelas fixas, centavos inteiros, última parcela ajustada. Referência R$ 2.000/10x/15% a.m. = 9 × **R$ 398,50** + **R$ 398,58**. CET por TIR. Catálogo: R$ 1.000, 2.000, 3.000, 5.000, 10.000; prazos 3/6/10/12; versões imutáveis (alteração só afeta novas propostas).
- Vencimentos: 1ª parcela 30 dias após o desembolso (data civil de Brasília), demais mensais. Sem multa/juros de mora (ver pendências).

### Banco (Supabase, projeto "World Cred" `avcmpjqmbcgrzgbajbvj`)
- 11 migrations aplicadas (`supabase/migrations/0001` a `0011`). RLS por perfil; funções transacionais `wc_*` (pagamento idempotente, desembolso, régua, conciliação, casos, painel, leads, cadastro próprio, cartão).
- Teste E2E (`npm run test:e2e`) **10/10** passando contra o projeto: fluxo completo, webhook duplicado, QR expirado, pagamento parcial, falha de SMS, tempo limite no desembolso, isolamento entre carteiras, cadastro próprio com ID do agente.
- Varredura com sessões reais (`node scripts/smoke.mjs`) cobre 36 páginas dos três portais + DEV.

### Integrações
| Integração | Estado | Observação |
|---|---|---|
| **Pix cobrança (parcelas)** | **REAL** via Mercado Pago (`PIX_PROVIDER=mercadopago`) | QR/copia e cola gerados pela API; webhook assinado faz a baixa automática; estorno vai para conciliação. Testado ao vivo (criar/consultar/cancelar). |
| **Pix desembolso (saída)** | **SIMULADO** | MP não envia Pix por API. Aguarda conta **Banco Inter** (certificado + credenciais). Esqueleto em `src/lib/pix/bacen.ts`. |
| **Validação de chave Pix (DICT)** | SIMULADO | Também virá com o Inter. Hoje exige chave no CPF do cliente. |
| **Cartão (Checkout Transparente MP)** | **REAL**, credenciais de produção da Simplix | Formulário do cartão dentro do portal (Brick); só o token chega ao servidor. Admin libera o Pix líquido após aprovação. Mínimo temporário **R$ 10** para teste (voltar a R$ 1.000). |
| **Webhook Mercado Pago** | Configurado e validado | URL neutra `https://simplix-pay.vercel.app/api/webhooks/mercadopago`; eventos: Pagamentos (legacy), Contestações, Alertas de fraude; assinatura `MP_WEBHOOK_SECRET`. |
| **SMS** | SIMULADO (`SMS_PROVIDER=mock`) | Esqueleto Twilio pronto. Telefone terminado em `0000` falha de propósito. |
| **Consulta de CPF (vaultlogs)** | Configurada, **API fora do ar** (DNS não resolve) | Cadastro cai no preenchimento manual. Confirmar URL atual com o fornecedor. |
| **MFA admin** | **Desligado** a pedido | Botão em Admin → Configurações. Religar antes de dinheiro real. |

### Interface
- Identidade navy `#101E5A` + verde `#0F7A5A`, fontes Manrope/Inter/JetBrains Mono, motion (login com órbitas, navegação com indicador, KPIs com contagem, QR Pix com revelação, cartão com Brick).
- Landing pública com simulador ao vivo e duas opções (crédito padrão disponível; cartão disponível quando ativo).
- Painel admin redesenhado: caixa do período, automação (baixa automática × intervenção humana), carteira a receber por faixa (vencido / 7 / 8–15 / 16–30 / +30 dias) clicável, filas "Precisa de você".

---

## 3. Acessos

| Conta | E-mail | Senha | Perfil |
|---|---|---|---|
| Bruno | brucnascimento@gmail.com | (definida em 2026-11-18; trocar) | admin + DEV |
| Admin demo | admin@worldcred.demo | Demo@12345 | admin |
| Agente Ana (ID **WC1001**) | agente1@worldcred.demo | Demo@12345 | agente |
| Agente Bruno (ID **WC1002**) | agente2@worldcred.demo | Demo@12345 | agente |
| Carla (contrato ativo, Pix validada) | cliente1@worldcred.demo | Demo@12345 | cliente |
| Diego (proposta aguardando aceite) | cliente2@worldcred.demo | Demo@12345 | cliente |
| Elisa (proposta aguardando aprovação) | cliente3@worldcred.demo | Demo@12345 | cliente |

Dados de teste no banco: 3 clientes "Teste E2E" e "Self …" na carteira da Ana; parcela 11 de **R$ 2,00 vencida** no contrato da Carla (`/cliente/parcelas/4f4f5cef-4876-40fd-a885-9a881efebc22`) para testar o Pix real. Limpar antes de operar.

---

## 4. Variáveis de ambiente (Vercel e `.env.local`)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (chave `sb_secret_`), `NEXT_PUBLIC_APP_URL=https://worldcred.digital`, `CRON_SECRET`, `PORTAL_LINK_SECRET`, `PIX_WEBHOOK_SECRET`, `MFA_ENFORCEMENT=on`, `PIX_PROVIDER=mercadopago`, `SMS_PROVIDER=mock`, `VAULTLOGS_API_URL/KEY`, `MP_ACCESS_TOKEN` (produção), `NEXT_PUBLIC_MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET`, `DEV_EMAILS` (padrão brucnascimento@gmail.com).

Segredos nunca vão para o repositório. Modelo em `.env.example`.

---

## 5. Pendências (ordem sugerida)

1. **Teste real do Pix de parcela**: pagar a parcela de R$ 2,00 da Carla e confirmar a baixa automática.
2. **Teste real do cartão**: R$ 10 em 2x (R$ 12,32 no cartão) com cartão real; estornar no painel do MP. Depois **voltar o mínimo para R$ 1.000** (Admin → Cartão ou `settings.card.min_cents`).
3. **Banco Inter**: abrir conta PJ, criar aplicação Pix (cobrança + pagamento), enviar certificado e credenciais por canal seguro. Adaptar provedor, testar com R$ 1,00, trocar desembolso de simulado para real.
4. **Consulta de CPF**: obter URL/endpoint atual com o fornecedor; ajustar `VAULTLOGS_API_URL`.
5. **Leads**: (a) botão "Enviar pelo WhatsApp" no portal do agente; (b) lead parcial salvo no passo 1 do cadastro para quem desiste; (c) futuro: WhatsApp Business API como canal de entrada.
6. **Multa e juros de mora** nas parcelas vencidas (hoje o valor não muda após o vencimento).
7. **Religar MFA** do admin antes de autorizar Pix real; revisar texto da proposta/contrato, enquadramento e CET com jurídico/contábil; confirmar com o PSP os fluxos autorizados.
8. Limpar dados de teste; revogar o token `sbp_` do Supabase que circulou no chat; trocar a senha inicial do Bruno.
9. Passar as telas de tabela do admin (aprovações, desembolsos, cobrança, conciliação) pela mesma passagem de design do painel.

---

## 6. Comandos úteis

```bash
npm run dev                 # local (usa .env.local)
npm run test:unit           # 19 testes do motor financeiro
npm run test:e2e            # 10 cenários contra o Supabase
node scripts/smoke.mjs      # varredura de páginas com login real (contra next start em :3100)
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-remote.mjs avcmpjqmbcgrzgbajbvj --force   # aplicar migrations
```

Documentos: `README.md` (execução e arquitetura), `docs/superpowers/specs/2026-11-17-worldcred-design.md` (decisões de projeto).
