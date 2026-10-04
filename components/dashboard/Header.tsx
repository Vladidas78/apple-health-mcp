import { PLAN } from "@/lib/coach/plan-defaults";
import { berlinTime } from "@/lib/dashboard/time";
import { RefreshForm } from "./RefreshButton";

export type SyncStatus = "ok" | "throttled" | "error" | "nokey" | null;

const MSG: Record<Exclude<SyncStatus, null>, string> = {
  ok: "HEVY aktualisiert.",
  throttled: "Zuletzt vor unter 10 min synchronisiert.",
  error: "HEVY-Sync fehlgeschlagen, alte Daten.",
  nokey: "HEVY_API_KEY fehlt.",
};

export function Header({ now, hevySync, refreshAction, status }: {
  now: Date;
  hevySync: Date | null;
  refreshAction?: (formData: FormData) => Promise<void>; // undefined → button hidden
  status?: SyncStatus;
}) {
  return (
    <header className="hdr">
      <div>
        <h1 className="head hdr__title">{PLAN.title}</h1>
        <div className="mono hdr__sub">{PLAN.weeks} Wochen · bis {PLAN.end.split("-").reverse().join(".")}</div>
      </div>
      <div className="hdr__right">
        <div className="mono hdr__stand">
          Stand {berlinTime(now)}
          {hevySync ? <span className="mute"> · HEVY {berlinTime(hevySync)}</span> : null}
        </div>
        {refreshAction ? <RefreshForm action={refreshAction} /> : null}
        {status ? <div className="mono hdr__msg">{MSG[status]}</div> : null}
      </div>
    </header>
  );
}
