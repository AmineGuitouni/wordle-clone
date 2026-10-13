import { MAX_ATTEMPTS, WORD_LENGTH } from "@/lib/game/rules";

export default function Loading() {
  return (
    <div
      className="board flex flex-1 flex-col items-center gap-3 px-4 pt-20"
      aria-busy="true"
      aria-label="Loading game"
    >
      <div className="flex flex-col animate-pulse" style={{ gap: "var(--tile-gap)" }}>
        {Array.from({ length: MAX_ATTEMPTS }, (_, row) => (
          <div key={row} className="flex" style={{ gap: "var(--tile-gap)" }}>
            {Array.from({ length: WORD_LENGTH }, (_, col) => (
              <div key={col} className="tile" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
