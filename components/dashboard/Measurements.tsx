import type { MeasurementsData } from "@/lib/dashboard/queries";
import { fmtDay } from "@/lib/dashboard/time";
import { num, signed } from "./format";
import { Block, Empty, fromLoader, type Loaded } from "./Block";

export function Measurements({ data }: { data: Loaded<MeasurementsData> }) {
  return (
    <Block title="Umfänge" wide>
      {fromLoader(data, (m) => {
        if (!m.rows.length || !m.hasCircumference) {
          return (
            <>
              <Empty>Erste Umfänge: Taille, Brust, Oberarm in HEVY eintragen.</Empty>
              {m.rows.length ? <p className="note">Letztes Gewicht {num(m.rows[0].weightKg)} kg am {fmtDay(m.rows[0].day)}.</p> : null}
            </>
          );
        }
        return (
          <table className="tbl">
            <thead>
              <tr><th>Datum</th><th>kg</th><th>Taille</th><th>Brust</th><th>Arm</th></tr>
            </thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.day}>
                  <td>{fmtDay(r.day)}</td><td>{num(r.weightKg)}</td><td>{num(r.waistCm)}</td><td>{num(r.chestCm)}</td><td>{num(r.bicepCm)}</td>
                </tr>
              ))}
              {m.deltas ? (
                <tr className="delta">
                  <td>Δ</td><td>{signed(m.deltas.weightKg)}</td><td>{signed(m.deltas.waistCm)}</td><td>{signed(m.deltas.chestCm)}</td><td>{signed(m.deltas.bicepCm)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        );
      })}
    </Block>
  );
}
