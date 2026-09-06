import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

export const proxy = auth((req) => {
  const pathName = req.nextUrl.pathname;

  if (pathName.startsWith("/api")) {
    return NextResponse.next();
  }

  if (!req.auth && pathName !== "/") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (req.auth && pathName === "/") {
    return NextResponse.redirect(new URL("/game", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
