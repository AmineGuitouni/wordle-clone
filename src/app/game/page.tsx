import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import GameBoard from "@/components/game/GameBoard";
import { getGameView, getTodaysRound } from "@/lib/game/service";
import { hasPasskey } from "@/lib/identity/passkeys";

export const metadata: Metadata = { title: "Play" };
export const dynamic = "force-dynamic";

export default async function GamePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const round = await getTodaysRound();
  const [game, savedPasskey] = await Promise.all([getGameView(session.user.id, round), hasPasskey(session.user.id)]);

  return <GameBoard initialGame={game} hasPasskey={savedPasskey} />;
}
