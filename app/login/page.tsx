import { login } from "./actions";

export const dynamic = "force-dynamic";

// Single-user login for the dashboard. Mirrors the OAuth /authorize form, but the
// password is COACH_WEB_SECRET, never MCP_SECRET, and the result is a cookie, not
// a bearer token.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const configured = !!process.env.COACH_WEB_SECRET;
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 420, margin: "10vh auto", padding: "0 1rem", color: "#111" }}>
      <h1 style={{ fontSize: "1.25rem" }}>Coach – Anmeldung</h1>
      {!configured && (
        <p style={{ color: "#c00", fontSize: ".9rem" }}>
          COACH_WEB_SECRET ist nicht gesetzt. Ohne diese Umgebungsvariable ist kein Login möglich.
        </p>
      )}
      {error && <p style={{ color: "#c00", fontSize: ".9rem" }}>Falsches Passwort.</p>}
      <form action={login}>
        <input
          type="password"
          name="secret"
          placeholder="Passwort"
          autoFocus
          required
          autoComplete="current-password"
          style={{ width: "100%", padding: ".6rem", fontSize: "1rem", border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" }}
        />
        <button
          type="submit"
          disabled={!configured}
          style={{ marginTop: ".75rem", width: "100%", padding: ".6rem", fontSize: "1rem", border: 0, borderRadius: 8, background: "#111", color: "#fff", cursor: "pointer" }}
        >
          Anmelden
        </button>
      </form>
    </main>
  );
}
