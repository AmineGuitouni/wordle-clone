"use client";

import { Button } from "@heroui/react";
import { useState } from "react";
import { LuCheck, LuKeyRound } from "react-icons/lu";
import { passkeyErrorMessage, savePasskey } from "@/lib/identity/passkey-client";
import { cn } from "@/lib/utils";

/**
 * "Keep your progress": saves a passkey for the signed-in player. Synced passkeys (iCloud Keychain, Google Password
 * Manager, ...) then sign them back in on their other devices, with nothing to type or remember.
 */
export default function SavePasskey({
  compact = false,
  className,
  onSaved,
}: {
  /** One row, for tight spots like the result panel. */
  compact?: boolean;
  className?: string;
  onSaved?: () => void;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setState("saving");
    setError(null);
    const outcome = await savePasskey();
    if (outcome.ok || outcome.error === "already_saved") {
      setState("saved");
      onSaved?.();
      return;
    }
    setState("idle");
    setError(passkeyErrorMessage(outcome.error));
  }

  const saved = state === "saved";
  const message = saved
    ? "Saved. On another device, choose “Use a passkey” on the home page to keep playing as you."
    : "Save a passkey to play as yourself on your other devices. No email, no password.";
  const button = (
    <Button
      size="sm"
      radius="lg"
      color={saved ? "success" : "primary"}
      variant={saved ? "flat" : "solid"}
      className={cn("font-semibold", compact && "w-full shrink-0 sm:w-auto")}
      isLoading={state === "saving"}
      isDisabled={saved}
      startContent={saved ? <LuCheck /> : state === "idle" ? <LuKeyRound /> : undefined}
      onPress={save}
    >
      {saved ? "Saved" : compact ? "Save passkey" : "Save with a passkey"}
    </Button>
  );

  return (
    <div
      className={cn(
        "flex w-full flex-col rounded-xl border border-primary/20 bg-primary/5 text-left",
        compact ? "gap-1.5 p-2.5" : "gap-3 p-3",
        className,
      )}
    >
      <div className={cn("flex", compact ? "flex-wrap items-center gap-x-3 gap-y-2" : "items-start gap-3")}>
        <LuKeyRound className={cn("size-5 shrink-0 text-primary", !compact && "mt-0.5")} aria-hidden />
        <div className={cn("flex-1", compact && "min-w-48")}>
          {compact ? (
            <p className="text-xs text-foreground/70">
              <span className="font-semibold text-foreground">Keep your progress.</span> {message}
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold">Keep your progress</p>
              <p className="text-xs text-foreground/70">{message}</p>
            </>
          )}
        </div>
        {compact && button}
      </div>
      {!compact && button}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
