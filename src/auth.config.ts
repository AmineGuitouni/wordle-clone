import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import { normalizeGuestName } from "@/lib/validation";

/**
 * Edge-safe Auth.js config shared by `auth.ts` (server) and `proxy.ts` (edge).
 * Guests get a random id on every sign-in and live purely in the signed JWT,
 * so no user record or database adapter is involved.
 */
export default {
  providers: [
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: {
        name: { label: "Name", type: "text", placeholder: "Choose a name" },
      },
      async authorize(credentials) {
        const name = normalizeGuestName(credentials?.name);
        if (!name) return null;
        return { id: globalThis.crypto.randomUUID(), name };
      },
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
