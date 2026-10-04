"use client";

import { useEffect, useState } from "react";

// Hero count-up: the server renders the final number (no flash without JS),
// the client counts from 0 to it in 600 ms, eased out. Respects
// prefers-reduced-motion. The only motion on the page besides the level bar.
export function XpCount({ xp }: { xp: number }) {
  const [v, setV] = useState(xp);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 600);
      setV(Math.round(xp * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setV(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [xp]);
  return <>+{v.toLocaleString("de-DE")} XP</>;
}
