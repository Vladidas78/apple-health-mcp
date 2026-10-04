import { PLAN } from "@/lib/coach/plan-defaults";

export type SyncStatus = "ok" | "throttled" | "error" | "nokey" | null;

export const SYNC_MSG: Record<Exclude<SyncStatus, null>, string> = {
  ok: "HEVY aktualisiert.",
  throttled: "Zuletzt vor unter 10 min synchronisiert.",
  error: "HEVY-Sync fehlgeschlagen, alte Daten.",
  nokey: "HEVY_API_KEY fehlt.",
};

// Title only: sync time and refresh live in the footer (Gina v2).
export function Header() {
  return (
    <header className="hdr">
      <h1 className="head hdr__title">{PLAN.title}</h1>
    </header>
  );
}
