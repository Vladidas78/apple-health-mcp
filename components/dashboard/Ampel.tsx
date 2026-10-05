import type { RecoveryData } from "@/lib/dashboard/queries";
import { num } from "./format";
import type { Loaded } from "./Block";

const WORD: Record<RecoveryData["ampel"], string> = { gruen: "Grün", gelb: "Gelb", stopp: "Stopp", unbekannt: "Keine Werte" };

// Traffic light as one pill: word, then today's RHR and HRV next to their base.
export function Ampel({ recovery }: { recovery: Loaded<RecoveryData> }) {
  const r = recovery.ok ? recovery.data : null;
  const ampel = r?.ampel ?? "unbekannt";
  const parts: string[] = [];
  if (r?.rhr.today !== null && r?.rhr.today !== undefined) parts.push(`RHR ${num(r.rhr.today, 0)}`);
  if (r?.hrv.today !== null && r?.hrv.today !== undefined) parts.push(`HRV ${num(r.hrv.today, 0)}`);
  if (r?.sleep.hours !== null && r?.sleep.hours !== undefined) parts.push(`Schlaf ${num(r.sleep.hours, 1)} h`);
  return (
    <div className={`pill pill--${ampel}`} role="status" aria-label={`Erholungsampel ${WORD[ampel]}`} title={r?.reasons.join(" · ") || undefined}>
      <i className="pill__dot" />
      <b>{WORD[ampel]}</b>
      {parts.length ? <span className="pill__d">· {parts.join(" · ")}</span> : null}
    </div>
  );
}
