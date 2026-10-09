import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { Adapter } from "next-auth/adapters";
import NextAuth from "next-auth";
import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { createDiscordProvider } from "@/lib/discord-provider";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const baseAdapter = hasDatabase
  ? DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    })
  : undefined;

const privacyAdapter: Adapter | undefined = baseAdapter
  ? {
      ...baseAdapter,
      linkAccount(account) {
        return baseAdapter.linkAccount!({
          ...account,
          access_token: undefined,
          refresh_token: undefined,
          id_token: undefined,
        });
      },
    }
  : undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: privacyAdapter,
  session: {
    strategy: hasDatabase ? "database" : "jwt",
    maxAge: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  providers: [
    createDiscordProvider(),
  ],
  callbacks: {
    session({ session, user, token }) {
      if (session.user) session.user.id = user?.id ?? token.sub ?? "";
      return session;
    },
  },
  pages: { signIn: "/" },
  trustHost:
    process.env.NODE_ENV === "development" ||
    Boolean(process.env.VERCEL) ||
    process.env.AUTH_TRUST_HOST === "true",
});
