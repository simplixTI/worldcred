import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { reconcilePendingDisbursements } from "@/lib/services/disbursements";
import { expireCharges } from "@/lib/services/charges";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const disbursements = await reconcilePendingDisbursements();
  const charges = await expireCharges();
  return NextResponse.json({ disbursements, charges });
}
export const POST = GET;
