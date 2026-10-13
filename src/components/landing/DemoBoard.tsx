import { evaluateGuess } from "@/lib/game/rules";

const ANSWER = "WORLD";
const DEMO_GUESSES = ["ROUND", "WORDS", "WORLD"];

/**
 * A decorative, self-playing example board for the landing page. It is rendered on the server with the
 * real scoring rules and animated purely with CSS, so it adds no client-side JavaScript.
 */
export default function DemoBoard() {
  return (
    <div
      aria-hidden
      className="board flex flex-col"
      style={{ gap: "var(--tile-gap)", ["--tile-size" as string]: "min(3.6rem, 13vw)" }}
    >
      {DEMO_GUESSES.map((guess, row) => {
        const result = evaluateGuess(guess, ANSWER);
        const isWin = row === DEMO_GUESSES.length - 1;
        return (
          <div
            key={guess}
            className="flex"
            style={{ gap: "var(--tile-gap)", ["--d" as string]: `${row * 1900 + 600}ms` }}
          >
            {[...guess].map((letter, col) => (
              <div
                key={col}
                className="tile"
                data-state={result[col]}
                data-reveal="true"
                data-win={isWin ? "true" : undefined}
                style={{ ["--i" as string]: col }}
              >
                {letter}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
