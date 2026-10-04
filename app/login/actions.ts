"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signWeb, webPasswordOk, WEB_SESSION_COOKIE, WEB_SESSION_TTL_S } from "@/lib/web-auth";

// Browser login: prove you hold COACH_WEB_SECRET, get a signed HttpOnly cookie.
// The cookie is a self-contained HMAC token (lib/web-auth.ts), no session table.
export async function login(formData: FormData): Promise<void> {
  const secret = formData.get("secret")?.toString() ?? "";
  if (!webPasswordOk(secret)) {
    redirect("/login?error=1");
  }
  const token = await signWeb();
  const jar = await cookies();
  jar.set(WEB_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: WEB_SESSION_TTL_S,
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.set(WEB_SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  redirect("/login");
}
