import NextAuth from "next-auth";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import authConfig from "./auth.config";
import { clientPromise } from "./lib/mongodb";

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: MongoDBAdapter(clientPromise),
  session: {
    strategy: "jwt",
  },
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  callbacks: {
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }

      if (session.user && !session.user.name) {
        session.user.name = "Guest";
      }

      return session;
    },
  },
});
