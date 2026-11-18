import { NextResponse } from "next/server";
import { runCollectionCycle } from "@/lib/services/collections";
import { cronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const result = await runCollectionCycle();
  return NextResponse.json(result);
}
export const POST = GET;
