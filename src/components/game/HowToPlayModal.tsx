"use client";

import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Button } from "@heroui/react";
import type { TileState } from "@/lib/game/rules";
import { MAX_ATTEMPTS, WORD_LENGTH } from "@/lib/game/rules";

function ExampleRow({ word, highlight, state }: { word: string; highlight: number; state: TileState }) {
  return (
    <div
      className="board flex"
      style={{ gap: "var(--tile-gap)" }}
      aria-label={`${word}: letter ${highlight + 1} is ${state}`}
    >
      {[...word].map((letter, i) => (
        <div
          key={i}
          className="tile"
          data-state={i === highlight ? state : undefined}
          style={{ "--tile-size": "2.5rem" } as React.CSSProperties}
        >
          {letter}
        </div>
      ))}
    </div>
  );
}

export default function HowToPlayModal({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      backdrop="blur"
      placement="center"
      scrollBehavior="inside"
      size="md"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="font-display text-2xl">How to play</ModalHeader>
            <ModalBody className="gap-4 text-sm text-foreground/80">
              <p>
                Guess the hidden <strong>{WORD_LENGTH}-letter word</strong> in {MAX_ATTEMPTS} tries. Each guess must be
                a valid word. After every guess the tiles change colour to show how close you were.
              </p>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <ExampleRow word="WORLD" highlight={0} state="correct" />
                  <p>
                    <strong>W</strong> is in the word and in the correct spot.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <ExampleRow word="PILOT" highlight={2} state="present" />
                  <p>
                    <strong>L</strong> is in the word but in the wrong spot.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <ExampleRow word="VAGUE" highlight={3} state="absent" />
                  <p>
                    <strong>U</strong> is not in the word in any spot.
                  </p>
                </div>
              </div>
              <p>
                A new word arrives regularly. Solve it in fewer tries and less time to climb today&apos;s leaderboard.
              </p>
            </ModalBody>
            <ModalFooter>
              <Button color="primary" radius="lg" className="font-semibold" onPress={onClose}>
                Got it
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
