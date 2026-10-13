import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = new Set(["/", "/leaderboard"]);

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;

  // Signed-in players have no use for the landing page.
  if (req.auth && pathname === "/") {
    return NextResponse.redirect(new URL("/game", req.url));
  }

  if (!req.auth && !PUBLIC_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Skip API routes (they authenticate themselves), Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
