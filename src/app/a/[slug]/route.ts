import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Link de indicação do agente: worldcred.digital/a/<slug> → landing com ref */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const safe = slug.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  return NextResponse.redirect(`${env.appUrl}/cadastro?ref=${encodeURIComponent(safe)}`);
}
