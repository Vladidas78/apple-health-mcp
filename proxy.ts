import { NextResponse, type NextRequest } from "next/server";
import { verifyWeb, WEB_SESSION_COOKIE } from "@/lib/web-auth";

// Login gate for every page. Next 16 names this file `proxy.ts` (the former
// `middleware.ts` convention is deprecated in next/dist/build/index.js).
// API routes, Next internals, the login page itself, OAuth discovery, favicon and
// manifest stay open; everything else needs a valid `coach_session` cookie.
export async function proxy(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(WEB_SESSION_COOKIE)?.value;
  if (await verifyWeb(token)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url, 302);
}

export const config = {
  matcher: ["/((?!api/|_next/|login|\\.well-known/|favicon\\.ico|manifest\\.webmanifest|icon).*)"],
};
