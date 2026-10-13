import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { auth } from "@/auth";
import NavBar from "@/components/layout/NavBar";
import { Providers } from "@/providers/Providers";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  // Needed for absolute Open Graph URLs off Vercel; when unset, Next.js falls back to Vercel's own URL variables.
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: {
    default: "Guess the Word — a daily word puzzle",
    template: "%s · Guess the Word",
  },
  description:
    "Guess the hidden five-letter word in six tries. A new word every day, no sign-up, and a live leaderboard.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070a14" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6fc" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user ? { name: session.user.name ?? "Guest", image: session.user.image ?? null } : null;

  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <body>
        <Providers>
          <div className="flex min-h-dvh flex-col">
            <NavBar user={user} />
            <main className="flex flex-1 flex-col">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
