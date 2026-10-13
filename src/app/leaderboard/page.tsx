import type { Metadata } from "next";
import { auth } from "@/auth";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import { getLeaderboard, getTodaysRound } from "@/lib/game/service";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const [session, round] = await Promise.all([auth(), getTodaysRound()]);
  const entries = await getLeaderboard(round, session?.user?.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12">
      <header>
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Today&apos;s leaderboard</h1>
        <p className="mt-2 text-foreground/70">
          The fastest solvers of today&apos;s word. Fewer tries and a quicker solve earn a higher score.
        </p>
      </header>
      <LeaderboardTable entries={entries} />
    </div>
  );
}
