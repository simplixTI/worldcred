"use client";
import { useState, useTransition } from "react";
import { saveSettings } from "../actions";
import { Alert, Field } from "@/components/ui";
import type { CollectionSettings } from "@/lib/services/settings";

export function SettingsForm({ collection }: { collection: CollectionSettings }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>();
  return (
    <form className="space-y-2 text-sm" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); start(async () => {
      const stages = String(f.get("stages")).split(/[,\s]+/).map(Number).filter((n) => !Number.isNaN(n)).map((n) => ({ code: `D${n}`, offset_days: n }));
      setMsg(await saveSettings("collection", { ...collection, stages, case_after_days: Number(f.get("case_after_days")), window_start: String(f.get("window_start")), window_end: String(f.get("window_end")), review_pause_hours: Number(f.get("review_pause_hours")), channel: String(f.get("channel")), whatsapp_authorized: f.get("whatsapp_authorized") === "on", template: String(f.get("template")) }));
    }); }}>
      <Field label="Etapas (dias após o vencimento)" hint="Padrão: 0, 3, 7"><input name="stages" className="input" defaultValue={collection.stages.map((s) => s.offset_days).join(", ")} /></Field>
      <Field label="Abrir caso após (dias)"><input name="case_after_days" type="number" className="input" defaultValue={collection.case_after_days} /></Field>
      <div className="grid grid-cols-2 gap-2"><Field label="Janela início"><input name="window_start" type="time" className="input" defaultValue={collection.window_start} /></Field><Field label="Janela fim"><input name="window_end" type="time" className="input" defaultValue={collection.window_end} /></Field></div>
      <Field label="Pausa por “Já paguei” (horas)"><input name="review_pause_hours" type="number" className="input" defaultValue={collection.review_pause_hours} /></Field>
      <Field label="Canal"><select name="channel" className="input" defaultValue={collection.channel}><option value="sms">SMS</option><option value="whatsapp">WhatsApp (somente se autorizado)</option></select></Field>
      <label className="flex items-center gap-2"><input type="checkbox" name="whatsapp_authorized" defaultChecked={collection.whatsapp_authorized} className="accent-green" /> Uso de WhatsApp autorizado pelo provedor</label>
      <Field label="Modelo do SMS" hint="Variáveis: {{n}}, {{total}}, {{due}}, {{link}}. Exposição mínima de dados."><textarea name="template" className="input h-20" defaultValue={collection.template} /></Field>
      {msg?.ok && <Alert kind="success">{msg.ok}</Alert>}{msg?.error && <Alert kind="danger">{msg.error}</Alert>}
      <button className="btn-primary" disabled={pending}>Salvar</button>
    </form>
  );
}
