// Number formatting for the dashboard: German decimal comma, no thousands noise.

export function num(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "–";
  return x.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function kg(x: number | null | undefined, digits = 1): string {
  return x === null || x === undefined ? "–" : `${num(x, digits)} kg`;
}

export function signed(x: number | null | undefined, digits = 1, unit = ""): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "–";
  const s = x > 0 ? "+" : x < 0 ? "−" : "±";
  return `${s}${num(Math.abs(x), digits)}${unit}`;
}

export function minutes(m: number | null | undefined): string {
  return m === null || m === undefined ? "–" : `${Math.round(m)} min`;
}
