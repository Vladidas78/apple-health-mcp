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
    <main className="wrap" style={{ maxWidth: 420, paddingTop: "12vh" }}>
      <h1 className="head" style={{ fontSize: 30, margin: "0 0 4px" }}>Coach</h1>
      <p className="mono small mute" style={{ margin: "0 0 20px" }}>Anmeldung</p>
      {!configured && (
        <p className="mono small mute">COACH_WEB_SECRET ist nicht gesetzt. Ohne diese Umgebungsvariable ist kein Login möglich.</p>
      )}
      {error && <p className="mono small" style={{ color: "var(--iron)" }}>Falsches Passwort.</p>}
      <form action={login}>
        <input
          type="password"
          name="secret"
          placeholder="Passwort"
          autoFocus
          required
          autoComplete="current-password"
          className="mono"
          style={{ width: "100%", padding: ".7rem", fontSize: "1rem", background: "var(--panel)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 2 }}
        />
        <button type="submit" disabled={!configured} className="btn btn--gold" style={{ marginTop: ".75rem", width: "100%", padding: ".7rem" }}>
          Anmelden
        </button>
      </form>
    </main>
  );
}
