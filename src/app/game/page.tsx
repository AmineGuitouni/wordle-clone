import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import GameBoard from "@/components/game/GameBoard";
import { getGameView, getTodaysWord } from "@/lib/game/service";

export const metadata: Metadata = { title: "Play" };
export const dynamic = "force-dynamic";

export default async function GamePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const answer = await getTodaysWord();
  const game = await getGameView(session.user.id, answer);

  return <GameBoard initialGame={game} />;
}
