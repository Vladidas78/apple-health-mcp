// Constant-time string comparison that runs in every runtime (Node route handlers,
// Server Actions, and the proxy), so it does not depend on `node:crypto`.
// Iterates over the longer input so the time taken does not reveal the length of
// the expected secret; the result is folded into a single accumulator.
export function secretEquals(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  const n = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
