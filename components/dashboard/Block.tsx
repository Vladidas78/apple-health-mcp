import type { ReactNode } from "react";

// One panel of the 1px grid. Server component, no state.
export function Block({ title, right, wide, className, children }: {
  title: string;
  right?: ReactNode;
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={["block", wide ? "block--wide" : "", className ?? ""].join(" ").trim()}>
      <h2 className="block__h">
        <span>{title}</span>
        {right ? <span>{right}</span> : null}
      </h2>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

// Result of one loader: the page never fails because one query failed.
export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

export function loaded<T>(data: T): Loaded<T> {
  return { ok: true, data };
}

// Render a block body; an exception inside the block becomes an inline note
// instead of a broken page. Blocks are plain functions, so calling them here
// executes their render synchronously.
export function safe(render: () => ReactNode): ReactNode {
  try {
    return render();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return <p className="err">Block nicht verfügbar: {msg.slice(0, 120)}</p>;
  }
}

// Body of a block fed by a loader: error state, then the renderer.
export function fromLoader<T>(l: Loaded<T>, render: (data: T) => ReactNode): ReactNode {
  if (!l.ok) return <p className="err">Daten nicht geladen: {l.error.slice(0, 120)}</p>;
  return safe(() => render(l.data));
}
