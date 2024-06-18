import type { Metadata } from "next";
import "./globals.css";
import { NextUiProviders } from "@/contexts/NextUiProv";
import { AOSProvider } from "@/contexts/AOSProvider";
import AppSession from "@/contexts/AppSession";

import NavBar from "@/components/navbar/navBar";
import { GoDot } from "react-icons/go";
import { GoDotFill } from "react-icons/go";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export const metadata: Metadata = {
  title: "wordle",
  description: "wordle game",
};

const numDots = Math.floor(Math.random() * 20) + 20;

const dots = Array.from({ length: numDots }, (_, index) => ({
  id: index,
  x: Math.random() * 100,
  y: Math.random() * 100,
}));

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions)
  return (
    <html lang="en" suppressHydrationWarning>
      <AppSession>
        <AOSProvider>
          <body>
            <NextUiProviders>
              <div className="fixed bg-gradient-to-t from-indigo-500 bottom-0 w-full h-full opacity-15">
              {dots.map((dot) => (
                  <GoDot
                    key={dot.id}
                  className={`text-primary-500 text-3xl blur-sm`}
                    style={{
                      position: 'absolute',
                      left: `${dot.x}%`,
                      top: `${dot.y}%`,
                    }}
                  />
                ))}
              </div>
              <main className="flex flex-col h-[100svh]">
                <NavBar session={session}/>
                <div className="w-full flex-grow max-h-[calc(100%-4rem)]">
                  {children}
                </div>
              </main>
            </NextUiProviders>
          </body>
        </AOSProvider>
      </AppSession>
    </html>
  );
}
