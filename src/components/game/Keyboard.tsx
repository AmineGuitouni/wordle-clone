"use client";

import { LuCornerDownLeft, LuDelete } from "react-icons/lu";
import type { TileState } from "@/lib/game/rules";
import { cn } from "@/lib/utils";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"] as const;

type KeyboardProps = {
  keyStates: Record<string, TileState>;
  onLetter: (letter: string) => void;
  onEnter: () => void;
  onBackspace: () => void;
};

function Key({
  label,
  state,
  className,
  onPress,
  children,
}: {
  label: string;
  state?: TileState;
  className?: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={state ? `${label}, ${state}` : label}
      data-state={state}
      className={cn("key", className)}
      onClick={(event) => {
        onPress();
        // Mouse and touch clicks (detail > 0) shouldn't leave focus on the key, otherwise a later physical
        // Enter would "click" it again. Keyboard-driven activation (detail === 0) keeps focus for a11y.
        if (event.detail > 0) event.currentTarget.blur();
      }}
    >
      {children}
    </button>
  );
}

export default function Keyboard({ keyStates, onLetter, onEnter, onBackspace }: KeyboardProps) {
  return (
    <div
      role="group"
      aria-label="On-screen keyboard"
      className="mx-auto flex w-full max-w-xl flex-col gap-1.5 sm:gap-2"
    >
      {ROWS.map((row, index) => (
        <div key={row} className={cn("flex gap-1.5 sm:gap-2", index === 1 && "px-[5%]")}>
          {index === 2 && (
            <Key label="Enter" className="flex-[1.6]" onPress={onEnter}>
              <LuCornerDownLeft className="size-5" />
            </Key>
          )}
          {[...row].map((letter) => (
            <Key key={letter} label={letter} state={keyStates[letter]} onPress={() => onLetter(letter)}>
              {letter}
            </Key>
          ))}
          {index === 2 && (
            <Key label="Backspace" className="flex-[1.6]" onPress={onBackspace}>
              <LuDelete className="size-5" />
            </Key>
          )}
        </div>
      ))}
    </div>
  );
}
