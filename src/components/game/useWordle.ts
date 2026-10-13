"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { submitGuess } from "@/app/game/actions";
import { getKeyStates, WORD_LENGTH, type TileState } from "@/lib/game/rules";
import type { GameView, GuessError } from "@/lib/game/types";
import { isValidWord } from "@/lib/game/words";

// Keep in sync with the tile animations in globals.css (flip 600ms, 280ms stagger, win bounce).
const FLIP_STAGGER_MS = 280;
const REVEAL_MS = 600 + (WORD_LENGTH - 1) * FLIP_STAGGER_MS + 150;
const WIN_CELEBRATION_MS = 1100;
const SHAKE_MS = 450;
const MESSAGE_MS = 1800;

const ERROR_MESSAGES: Record<GuessError, string> = {
  unauthenticated: "Your session expired. Please start again.",
  invalid_word: "Not in word list",
  game_over: "This game has already finished.",
  out_of_sync: "Your game changed in another tab. Reloading…",
  server_error: "Something went wrong. Please try again.",
};

export function useWordle(initialGame: GameView) {
  const [game, setGame] = useState(initialGame);
  const [current, setCurrent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const later = useCallback((callback: () => void, ms: number) => {
    timers.current.push(window.setTimeout(callback, ms));
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(window.clearTimeout);
  }, []);

  const notify = useCallback(
    (text: string) => {
      setMessage(text);
      later(() => setMessage((shown) => (shown === text ? null : shown)), MESSAGE_MS);
    },
    [later],
  );

  const reject = useCallback(
    (text: string) => {
      notify(text);
      setIsShaking(true);
      later(() => setIsShaking(false), SHAKE_MS);
    },
    [notify, later],
  );

  const isBusy = isSubmitting || isRevealing || game.status !== "playing";

  const typeLetter = useCallback(
    (letter: string) => {
      if (isBusy) return;
      setCurrent((word) => (word.length < WORD_LENGTH ? word + letter.toUpperCase() : word));
    },
    [isBusy],
  );

  const backspace = useCallback(() => {
    if (isBusy) return;
    setCurrent((word) => word.slice(0, -1));
  }, [isBusy]);

  const submit = useCallback(async () => {
    if (isBusy) return;
    if (current.length < WORD_LENGTH) return reject("Not enough letters");
    if (!isValidWord(current)) return reject(ERROR_MESSAGES.invalid_word);

    setIsSubmitting(true);
    try {
      const response = await submitGuess(current);

      if (!response.ok) {
        if (response.error === "invalid_word") return reject(ERROR_MESSAGES.invalid_word);
        notify(ERROR_MESSAGES[response.error]);
        // Reloading re-syncs a stale game, or lets the proxy send an expired session back to the landing page.
        if (
          response.error === "out_of_sync" ||
          response.error === "game_over" ||
          response.error === "unauthenticated"
        ) {
          later(() => window.location.reload(), 1500);
        }
        return;
      }

      setGame((previous) => ({
        guesses: [...previous.guesses, current],
        results: [...previous.results, response.result],
        status: response.status,
        answer: response.answer,
      }));
      setCurrent("");
      setIsRevealing(true);
      later(() => setIsRevealing(false), REVEAL_MS + (response.status === "won" ? WIN_CELEBRATION_MS : 0));
    } catch {
      notify(ERROR_MESSAGES.server_error);
    } finally {
      setIsSubmitting(false);
    }
  }, [isBusy, current, reject, notify, later]);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const target = event.target instanceof HTMLElement ? event.target : null;
    // Don't hijack typing in forms or interaction inside dialogs and menus.
    if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']")) return;

    if (event.key === "Enter") {
      // A focused button already turns Enter into its own click.
      if (target?.closest("button, a")) return;
      event.preventDefault();
      void submit();
    } else if (event.key === "Backspace") {
      backspace();
    } else if (/^[a-z]$/i.test(event.key)) {
      typeLetter(event.key);
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const revealRow = isRevealing ? game.guesses.length - 1 : null;

  // While the newest row is still flipping, keep its colours off the keyboard so nothing is spoiled early.
  const settledCount = revealRow === null ? game.guesses.length : revealRow;
  const keyStates: Record<string, TileState> = getKeyStates(
    game.guesses.slice(0, settledCount),
    game.results.slice(0, settledCount),
  );

  return {
    game,
    current,
    message,
    isShaking,
    isBusy,
    isSubmitting,
    revealRow,
    keyStates,
    isFinished: game.status !== "playing" && !isRevealing,
    typeLetter,
    backspace,
    submit,
  };
}
