"use server";

import { auth } from "@/auth";
import { normalizeGuess } from "@/lib/game/rules";
import { submitGuess as saveGuess } from "@/lib/game/service";
import type { GuessResult } from "@/lib/game/types";
import { isValidWord } from "@/lib/game/words";

/**
 * Server actions are public endpoints, so everything is re-validated here
 * regardless of what the client already checked.
 * Failures are returned rather than thrown because production builds strip thrown error messages.
 */
export async function submitGuess(input: string): Promise<GuessResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthenticated" };

  const guess = normalizeGuess(input);
  if (!guess || !isValidWord(guess)) return { ok: false, error: "invalid_word" };

  try {
    return await saveGuess({
      userId: session.user.id,
      name: session.user.name ?? "Guest",
      guess,
    });
  } catch (error) {
    console.error("submitGuess failed", error);
    return { ok: false, error: "server_error" };
  }
}
