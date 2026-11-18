import { NextResponse } from "next/server";
import { resolvePortalLink } from "@/lib/services/links";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await resolvePortalLink(token);
  if ("error" in r) return NextResponse.redirect(`${env.appUrl}/entrar?erro=${encodeURIComponent(r.error)}`);
  return NextResponse.redirect(`${env.appUrl}${r.redirectTo}`);
}
