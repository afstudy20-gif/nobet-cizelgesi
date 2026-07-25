import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * Global authentication gate.
 *
 * Everything is private by default. A path is only reachable without a session
 * if it is listed below, so adding a new route cannot accidentally expose it.
 */

/** Pages renderable without a session. */
const PUBLIC_PAGES = new Set(["/login"]);

/** API routes reachable without a session. */
const PUBLIC_API = new Set(["/api/auth/login", "/api/auth/logout", "/api/health"]);

const LOGIN_PATH = "/login";
const NEXT_PARAM = "next";

/**
 * Only same-origin, non-protocol-relative paths may be used as a post-login
 * redirect target, otherwise `?next=` becomes an open redirect.
 */
function safeRedirectTarget(pathWithQuery: string): string {
  if (!pathWithQuery.startsWith("/") || pathWithQuery.startsWith("//")) {
    return "/";
  }

  return pathWithQuery;
}

function unauthorizedApiResponse(): NextResponse {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
    { status: 401 }
  );
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && PUBLIC_API.has(pathname)) {
    return NextResponse.next();
  }

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (session) {
    // Already signed in — the login page has nothing to offer.
    if (pathname === LOGIN_PATH) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  }

  if (!isApi && PUBLIC_PAGES.has(pathname)) {
    return NextResponse.next();
  }

  if (isApi) {
    return unauthorizedApiResponse();
  }

  const loginUrl = new URL(LOGIN_PATH, req.url);
  loginUrl.searchParams.set(NEXT_PARAM, safeRedirectTarget(`${pathname}${search}`));

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /**
     * Match everything except Next.js internals and static assets. Anything
     * not excluded here goes through the gate.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|txt|xml)$).*)",
  ],
};
