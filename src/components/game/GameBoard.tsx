"use client";

import { Button } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { LuCircleHelp } from "react-icons/lu";
import { MAX_ATTEMPTS } from "@/lib/game/rules";
import type { GameView } from "@/lib/game/types";
import BoardRow from "./BoardRow";
import HowToPlayModal from "./HowToPlayModal";
import Keyboard from "./Keyboard";
import ResultPanel from "./ResultPanel";
import { useWordle } from "./useWordle";

export default function GameBoard({ initialGame }: { initialGame: GameView }) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const {
    game,
    current,
    message,
    isShaking,
    isSubmitting,
    revealRow,
    keyStates,
    isFinished,
    typeLetter,
    backspace,
    submit,
  } = useWordle(initialGame);

  const activeRow = game.status === "playing" ? game.guesses.length : -1;

  return (
    <div className="flex w-full flex-1 flex-col items-center gap-3 px-4 pb-4 pt-3 sm:pt-5 short:flex-row short:justify-center short:gap-8 short:py-2">
      {/* The wrapper shrink-wraps the board so the header and messages line up with it. */}
      <div className="board flex w-fit flex-col gap-3 short:gap-1">
        <header className="flex w-full items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold leading-tight sm:text-2xl short:text-lg">
              Today&apos;s word
            </h1>
            <p className="text-xs text-foreground/60" aria-live="polite">
              {game.status === "playing"
                ? `Guess ${Math.min(game.guesses.length + 1, MAX_ATTEMPTS)} of ${MAX_ATTEMPTS}`
                : `${game.guesses.length} of ${MAX_ATTEMPTS} used`}
            </p>
          </div>
          <Button isIconOnly variant="flat" radius="full" aria-label="How to play" onPress={() => setIsHelpOpen(true)}>
            <LuCircleHelp className="size-5" />
          </Button>
        </header>

        <div className="relative flex h-8 items-center justify-center short:h-0" role="status" aria-live="assertive">
          <AnimatePresence>
            {message && (
              <motion.p
                key={message}
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute whitespace-nowrap rounded-lg bg-foreground px-4 py-1.5 text-sm font-semibold text-background shadow-lg"
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <p className="sr-only" role="status">
          {isSubmitting ? "Checking your guess…" : ""}
        </p>

        <div role="grid" aria-label="Guess board" className="flex flex-col" style={{ gap: "var(--tile-gap)" }}>
          {Array.from({ length: MAX_ATTEMPTS }, (_, row) => (
            <BoardRow
              key={row}
              rowNumber={row + 1}
              letters={game.guesses[row] ?? (row === activeRow ? current : "")}
              states={game.results[row]}
              reveal={row === revealRow}
              win={game.status === "won"}
              shake={row === activeRow && isShaking}
              pending={row === activeRow && isSubmitting}
            />
          ))}
        </div>
      </div>

      <div className="mt-auto flex w-full flex-col justify-end pt-2 short:mt-0 short:w-[min(26rem,50vw)] short:pt-0">
        {isFinished ? (
          <ResultPanel game={game} />
        ) : (
          <Keyboard
            keyStates={keyStates}
            isSubmitting={isSubmitting}
            onLetter={typeLetter}
            onEnter={submit}
            onBackspace={backspace}
          />
        )}
      </div>

      <HowToPlayModal isOpen={isHelpOpen} onOpenChange={setIsHelpOpen} />
    </div>
  );
}
