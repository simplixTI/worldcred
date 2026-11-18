import "server-only";
import { env } from "@/lib/env";
import { MockPixProvider } from "./mock";
import { BacenApiPixProvider } from "./bacen";
import type { PixProvider } from "./types";

let instance: PixProvider | null = null;

export function pixProvider(): PixProvider {
  if (instance) return instance;
  instance = env.pixProvider === "bacen" ? new BacenApiPixProvider() : new MockPixProvider();
  return instance;
}

export function mockPix(): MockPixProvider {
  const p = pixProvider();
  if (!(p instanceof MockPixProvider)) throw new Error("simulador disponível apenas com PIX_PROVIDER=mock");
  return p;
}

export * from "./types";
