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
    <main className="wrap login">
      <h1 className="top__h">Hey Vladi</h1>
      <p className="top__sub" style={{ margin: "4px 0 20px" }}>Anmeldung</p>
      {!configured && (
        <p className="note">COACH_WEB_SECRET ist nicht gesetzt. Ohne diese Umgebungsvariable ist kein Login möglich.</p>
      )}
      {error && <p className="note" style={{ color: "var(--red)", fontWeight: 700 }}>Falsches Passwort.</p>}
      <form action={login}>
        <input
          type="password"
          name="secret"
          placeholder="Passwort"
          autoFocus
          required
          autoComplete="current-password"
          className="login__in"
        />
        <button type="submit" disabled={!configured} className="btn btn--gold login__btn">
          Anmelden
        </button>
      </form>
    </main>
  );
}
