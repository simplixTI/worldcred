import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await getSession();
  redirect(s ? homeFor(s.role) : "/entrar");
}
