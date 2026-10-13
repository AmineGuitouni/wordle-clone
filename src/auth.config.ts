import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import { authorizeGuest } from "@/lib/identity/authorize";

/**
 * Edge-safe Auth.js config shared by `auth.ts` (server) and `proxy.ts` (edge).
 * A guest's id is their device identity (see lib/identity), so signing out and back in, even under a different
 * name, resolves to the same player. Sessions live in the signed JWT; no user record or database adapter is involved.
 */
export default {
  providers: [
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: {
        name: { label: "Name", type: "text", placeholder: "Choose a name" },
      },
      authorize: authorizeGuest,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  callbacks: {
    session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
