import type { TrainingWeekData } from "@/lib/dashboard/queries";
import { fromLoader, type Loaded } from "./Block";
import { BodyMap } from "./BodyMap";

export function Figure({ training }: { training: Loaded<TrainingWeekData> }) {
  return (
    <section className="card" aria-label="Deine Figur">
      <h2 className="card__h">Deine Figur · diese Woche</h2>
      {fromLoader(training, (t) => <BodyMap muscles={t.muscles} />)}
    </section>
  );
}
