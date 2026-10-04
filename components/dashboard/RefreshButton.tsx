"use client";

import { useState } from "react";

// The only client component on the page: it shows "Lädt …" while the server
// action runs. (useFormStatus would be nicer, but @types/react-dom is not
// installed and the repo must not grow a dependency for a label.)
export function RefreshForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  return (
    <form action={action} onSubmit={() => setPending(true)}>
      <button type="submit" className="btn" disabled={pending} aria-busy={pending}>
        {pending ? "Lädt …" : "Aktualisieren"}
      </button>
    </form>
  );
}
