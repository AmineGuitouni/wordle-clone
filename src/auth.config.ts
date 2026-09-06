import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";

export default {
  providers: [
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: {
        name: {
          label: "Name",
          type: "text",
          placeholder: "Choose a name",
        },
      },
      async authorize(credentials) {
        const requestedName = credentials?.name;
        const name =
          typeof requestedName === "string"
            ? requestedName.trim().replace(/\s+/g, " ")
            : "";

        if (name.length < 2 || name.length > 24) {
          return null;
        }

        const id = globalThis.crypto.randomUUID();

        return {
          id,
          name,
        };
      },
    }),
  ],
} satisfies NextAuthConfig;
