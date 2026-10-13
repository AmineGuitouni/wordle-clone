"use client";

import { Button } from "@heroui/react";
import { motion } from "framer-motion";
import NextLink from "next/link";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuHourglass, LuShare2, LuTrophy } from "react-icons/lu";
import SavePasskey from "@/components/auth/SavePasskey";
import { usePasskeySupport } from "@/components/auth/usePasskeySupport";
import { buildShareText, MAX_ATTEMPTS } from "@/lib/game/rules";
import type { GameView } from "@/lib/game/types";

const PRAISE = ["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!"];

export default function ResultPanel({ game, hasPasskey }: { game: GameView; hasPasskey: boolean }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const canUsePasskeys = usePasskeySupport();
  const resetTimer = useRef<number | undefined>(undefined);
  const panelRef = useRef<HTMLElement>(null);
  const won = game.status === "won";
  const tries = game.guesses.length;

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  // On short screens the panel can end below the fold; bring it into view once it has animated in.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (panel && panel.getBoundingClientRect().bottom > window.innerHeight) {
        panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, []);

  async function share() {
    let outcome: "copied" | "failed" = "copied";
    try {
      await navigator.clipboard.writeText(buildShareText(game.results, game.status));
    } catch {
      // Clipboard access can be denied (insecure context, unfocused document, browser policy).
      outcome = "failed";
    }
    setCopyState(outcome);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <motion.section
      ref={panelRef}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      aria-label="Game result"
      className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-foreground/10 bg-content1/70 p-5 text-center shadow-xl backdrop-blur"
    >
      <div>
        <h2 className="font-display text-2xl font-bold">
          {won ? PRAISE[Math.min(tries, MAX_ATTEMPTS) - 1] : "Out of tries"}
        </h2>
        {won ? (
          <p className="mt-1 text-foreground/70">
            You solved today&apos;s word in <strong>{tries}</strong> {tries === 1 ? "try" : "tries"}.
          </p>
        ) : (
          <p className="mt-1 text-foreground/70">
            Today&apos;s word was{" "}
            <strong className="rounded-md bg-primary/15 px-2 py-0.5 font-display tracking-widest text-primary">
              {game.answer}
            </strong>
            .
          </p>
        )}
      </div>

      {game.provisional && (
        <p className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-left text-xs text-foreground/80">
          <LuHourglass className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            New players&apos; first results are provisional: only you see this one on the leaderboard. Your wins count
            from the next word.
          </span>
        </p>
      )}

      <div className="flex w-full gap-2">
        <Button
          fullWidth
          radius="lg"
          className="font-semibold"
          color={copyState === "failed" ? "danger" : "primary"}
          startContent={copyState === "copied" ? <LuCheck /> : <LuShare2 />}
          onPress={share}
        >
          {copyState === "copied" ? "Copied!" : copyState === "failed" ? "Couldn't copy" : "Share result"}
        </Button>
        <Button
          as={NextLink}
          href="/leaderboard"
          fullWidth
          variant="bordered"
          radius="lg"
          className="font-semibold"
          startContent={<LuTrophy />}
        >
          Leaderboard
        </Button>
      </div>

      {canUsePasskeys && !hasPasskey && <SavePasskey compact />}
    </motion.section>
  );
}
