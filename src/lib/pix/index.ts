import "server-only";
import { env } from "@/lib/env";
import { MockPixProvider } from "./mock";
import { BacenApiPixProvider } from "./bacen";
import { MercadoPagoPixProvider } from "./mercadopago";
import type { PixProvider } from "./types";

let instance: PixProvider | null = null;

export function pixProvider(): PixProvider {
  if (instance) return instance;
  instance = env.pixProvider === "bacen" ? new BacenApiPixProvider() : env.pixProvider === "mercadopago" ? new MercadoPagoPixProvider() : new MockPixProvider();
  return instance;
}

export function mockPix(): MockPixProvider {
  const p = pixProvider();
  if (p instanceof MockPixProvider) return p;
  if (p instanceof MercadoPagoPixProvider) return p.payouts; // desembolso ainda simulado
  throw new Error("simulador disponível apenas com PIX_PROVIDER=mock ou mercadopago");
}
/** true quando o desembolso (Pix de saída) ainda é simulado */
export function payoutsAreMock(): boolean { const p = pixProvider(); return p instanceof MockPixProvider || p instanceof MercadoPagoPixProvider; }

export * from "./types";
