import { NextResponse } from "next/server";
import { processPixWebhook } from "@/lib/services/webhook";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  const headers: Record<string, string | null> = {};
  for (const [k, v] of req.headers.entries()) headers[k.toLowerCase()] = v;
  try {
    const out = await processPixWebhook(raw, headers);
    return NextResponse.json(out.body, { status: out.status });
  } catch (e) {
    console.error("[webhook/pix] erro", (e as Error).message);
    return NextResponse.json({ error: "erro interno" }, { status: 500 });
  }
}
