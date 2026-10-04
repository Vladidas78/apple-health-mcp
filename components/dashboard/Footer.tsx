import { berlinTime, fmtDay, berlinDay } from "@/lib/dashboard/time";
import { RefreshForm } from "./RefreshButton";
import { SYNC_MSG, type SyncStatus } from "./Header";

export function Footer({ now, hevySync, refreshAction, logoutAction, status }: {
  now: Date;
  hevySync: Date | null;
  refreshAction?: (formData: FormData) => Promise<void>;
  logoutAction?: (formData: FormData) => Promise<void>;
  status?: SyncStatus;
}) {
  const sameDay = hevySync && berlinDay(hevySync) === berlinDay(now);
  return (
    <footer className="ftr">
      <div className="ftr__stand mono">
        {hevySync ? `HEVY ${sameDay ? "" : `${fmtDay(berlinDay(hevySync))} `}${berlinTime(hevySync)}` : "HEVY –"} · STAND {berlinTime(now)}
        {status ? <div className="ftr__msg">{SYNC_MSG[status]}</div> : null}
      </div>
      <div className="ftr__btns">
        {refreshAction ? <RefreshForm action={refreshAction} /> : null}
        {logoutAction ? (
          <form action={logoutAction}>
            <button type="submit" className="btn">Abmelden</button>
          </form>
        ) : null}
      </div>
    </footer>
  );
}
