import { WORD_LENGTH, type TileState } from "@/lib/game/rules";

type BoardRowProps = {
  /** Letters typed or submitted so far; shorter than WORD_LENGTH while typing. */
  letters: string;
  /** Present once the row has been scored. */
  states?: readonly TileState[];
  /** Play the flip animation (only for a row that was just submitted). */
  reveal?: boolean;
  /** Bounce the row after the reveal because it solved the puzzle. */
  win?: boolean;
  shake?: boolean;
  /** The guess is waiting for the server's verdict. */
  pending?: boolean;
  rowNumber: number;
};

const STATE_LABEL: Record<TileState, string> = {
  correct: "correct",
  present: "in the word, wrong spot",
  absent: "not in the word",
};

export default function BoardRow({ letters, states, reveal, win, shake, pending, rowNumber }: BoardRowProps) {
  return (
    <div
      role="row"
      aria-label={`Guess ${rowNumber}`}
      data-shake={shake ? "true" : undefined}
      className="board-row flex"
      style={{ gap: "var(--tile-gap)" }}
    >
      {Array.from({ length: WORD_LENGTH }, (_, col) => {
        const letter = letters[col];
        const state = states?.[col];
        return (
          <div
            key={col}
            role="gridcell"
            aria-label={letter ? `${letter}${state ? `, ${STATE_LABEL[state]}` : ""}` : "empty"}
            data-filled={letter && !state ? "true" : undefined}
            data-state={state}
            data-pending={pending && letter ? "true" : undefined}
            data-reveal={reveal ? "true" : undefined}
            data-win={reveal && win ? "true" : undefined}
            className="tile"
            style={{ "--i": col } as React.CSSProperties}
          >
            {letter}
          </div>
        );
      })}
    </div>
  );
}
