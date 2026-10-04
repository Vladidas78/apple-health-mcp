import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logout } from "./login/actions";
import { verifyWeb, WEB_SESSION_COOKIE } from "@/lib/web-auth";

// Never cache: a cached page behind a proxy mistake would be public.
export const dynamic = "force-dynamic";

export default async function Home() {
  // Defense in depth: proxy.ts already redirects, but the page checks the cookie
  // itself so a matcher mistake cannot expose it.
  const jar = await cookies();
  if (!(await verifyWeb(jar.get(WEB_SESSION_COOKIE)?.value))) redirect("/login");

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 640, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Coach</h1>
      <p>Dashboard folgt.</p>
      <form action={logout}>
        <button type="submit" style={{ padding: ".5rem .9rem", border: "1px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
          Abmelden
        </button>
      </form>
    </main>
  );
}
