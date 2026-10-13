import NextLink from "next/link";
import { LuCrown, LuHourglass, LuMedal } from "react-icons/lu";
import { formatDuration } from "@/lib/game/score";
import type { LeaderboardEntry } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const MEDALS = [
  { Icon: LuCrown, className: "text-amber-400" },
  { Icon: LuMedal, className: "text-slate-300" },
  { Icon: LuMedal, className: "text-orange-400" },
];

function hueFromName(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 360;
  return hash;
}

function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

function Rank({ entry }: { entry: LeaderboardEntry }) {
  if (entry.provisional) {
    return (
      <span
        className="flex w-8 justify-center font-display text-sm font-bold text-foreground/40"
        aria-label={entry.rank ? `Would rank ${entry.rank}` : "Not ranked"}
      >
        {entry.rank ? `(${entry.rank})` : "–"}
      </span>
    );
  }
  const medal = entry.rank ? MEDALS[entry.rank - 1] : undefined;
  return (
    <span className="flex w-8 justify-center font-display text-base font-bold text-foreground/60 sm:text-lg">
      {medal ? <medal.Icon className={cn("size-6", medal.className)} aria-label={`Rank ${entry.rank}`} /> : entry.rank}
    </span>
  );
}

export default function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  const ownProvisional = entries.some((entry) => entry.provisional);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-foreground/20 bg-content1/40 px-6 py-14 text-center">
        <LuCrown className="size-10 text-amber-400" aria-hidden />
        <h2 className="font-display text-xl font-bold">Nobody has solved today&apos;s word yet</h2>
        <p className="max-w-sm text-foreground/70">Be the first one on the board — the crown is up for grabs.</p>
        <NextLink
          href="/game"
          className="mt-2 rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105"
        >
          Play today&apos;s word
        </NextLink>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-content1/60 shadow-xl backdrop-blur">
      <div
        className="hidden grid-cols-[3rem_1fr_5rem_5rem_6rem] gap-3 border-b border-foreground/10 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-foreground/50 sm:grid"
        aria-hidden
      >
        <span className="text-center">#</span>
        <span>Player</span>
        <span className="text-right">Tries</span>
        <span className="text-right">Time</span>
        <span className="text-right">Score</span>
      </div>

      <ol>
        {entries.map((entry, index) => (
          <li
            key={index}
            className={cn(
              "grid grid-cols-[2rem_1fr_auto] items-center gap-2 sm:gap-3 border-b border-foreground/5 px-3 py-3 last:border-b-0 sm:grid-cols-[3rem_1fr_5rem_5rem_6rem] sm:px-5",
              entry.isCurrentUser && "bg-primary/10",
              entry.provisional && "border-dashed bg-warning/5",
            )}
          >
            <Rank entry={entry} />

            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white sm:size-9"
                style={{ backgroundColor: `hsl(${hueFromName(entry.name)} 55% 42%)` }}
              >
                {initials(entry.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold" title={entry.name}>
                  {entry.name}
                  {entry.isCurrentUser && (
                    <span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-primary">
                      You
                    </span>
                  )}
                  {entry.provisional && (
                    <span className="ml-1.5 hidden rounded-full bg-warning/20 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-warning-600 dark:text-warning sm:inline">
                      Provisional
                    </span>
                  )}
                </p>
                <p className="text-xs text-foreground/60 sm:hidden">
                  {entry.tries} {entry.tries === 1 ? "try" : "tries"} · {formatDuration(entry.timeMs)}
                  {entry.provisional && (
                    <span className="font-semibold text-warning-600 dark:text-warning"> · Provisional</span>
                  )}
                </p>
              </div>
            </div>

            <span className="hidden text-right tabular-nums sm:block">{entry.tries}</span>
            <span className="hidden text-right tabular-nums sm:block">{formatDuration(entry.timeMs)}</span>
            <span
              className={cn(
                "text-right font-display font-bold tabular-nums",
                entry.provisional ? "text-foreground/50" : "text-primary",
              )}
            >
              {entry.score.toLocaleString("en-US")}
            </span>
          </li>
        ))}
      </ol>

      {ownProvisional && (
        <p className="flex items-start gap-2 border-t border-foreground/10 px-5 py-3 text-xs text-foreground/70">
          <LuHourglass className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            Your result is provisional, so only you can see it, in brackets at the place it would take. First results
            don&apos;t count; your wins are ranked from the next word.
          </span>
        </p>
      )}
    </div>
  );
}
