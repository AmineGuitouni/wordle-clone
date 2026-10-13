"use client";

import { Button, Input } from "@heroui/react";
import { signIn } from "next-auth/react";
import { type FormEvent, useState } from "react";
import { LuArrowRight, LuKeyRound, LuShieldCheck, LuUserRound } from "react-icons/lu";
import { establishIdentity } from "@/lib/identity/client";
import { passkeyErrorMessage, signInWithPasskey } from "@/lib/identity/passkey-client";
import { solveInWorker } from "@/lib/identity/solve";
import { GUEST_NAME_HINT, GUEST_NAME_MAX, normalizeGuestName } from "@/lib/validation";
import { usePasskeySupport } from "./usePasskeySupport";

function identityErrorMessage(outcome: {
  error: "invalid_name" | "rate_limited" | "failed";
  retryAfterSeconds?: number;
}) {
  if (outcome.error === "invalid_name") return GUEST_NAME_HINT;
  if (outcome.error === "rate_limited") {
    const minutes = Math.max(1, Math.ceil((outcome.retryAfterSeconds ?? 60) / 60));
    return `Too many new players from your network. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return "We couldn't start your session. Please try again.";
}

export default function GuestLoginForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "verifying" | "signing-in" | "passkey">("idle");
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const canUsePasskeys = usePasskeySupport();
  const isLoading = phase !== "idle";

  /** Auth.js creates the session from the identity cookie that was just set, then the page reloads into the game. */
  async function startSession(guestName: string) {
    const result = await signIn("guest", { name: guestName, redirect: false });
    if (result?.error) throw new Error(result.error);
    // A full reload re-renders the server layout with the new session; the proxy then sends "/" to "/game".
    window.location.reload();
  }

  async function handlePasskey() {
    setError(null);
    setPasskeyError(null);
    setPhase("passkey");
    const outcome = await signInWithPasskey();
    if (!outcome.ok) {
      setPasskeyError(passkeyErrorMessage(outcome.error));
      setPhase("idle");
      return;
    }
    try {
      await startSession(outcome.name);
    } catch {
      setPasskeyError("We couldn't start your session. Please try again.");
      setPhase("idle");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const guestName = normalizeGuestName(name);
    if (!guestName) {
      setError(GUEST_NAME_HINT);
      return;
    }

    setError(null);
    setPasskeyError(null);
    setPhase("signing-in");

    try {
      // Step 1: establish this browser's identity (new devices solve a short proof-of-work first).
      const identity = await establishIdentity(guestName, {
        solve: ({ salt, difficulty }) => solveInWorker(salt, difficulty),
        onChallenge: () => setPhase("verifying"),
      });
      if (!identity.ok) {
        setError(identityErrorMessage(identity));
        setPhase("idle");
        return;
      }

      // Step 2: Auth.js creates the session from that identity.
      setPhase("signing-in");
      await startSession(guestName);
    } catch {
      setError("We couldn't start your session. Please try again.");
      setPhase("idle");
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-3 sm:flex-row sm:items-start">
        <Input
          aria-label="Your name"
          placeholder="Pick a name to play"
          autoComplete="nickname"
          value={name}
          onValueChange={setName}
          maxLength={GUEST_NAME_MAX}
          isInvalid={Boolean(error)}
          errorMessage={error}
          description={
            phase === "verifying" ? (
              <span className="flex items-center gap-1.5 text-primary">
                <LuShieldCheck className="size-3.5" aria-hidden /> Running a quick one-time security check…
              </span>
            ) : undefined
          }
          size="lg"
          radius="lg"
          variant="bordered"
          startContent={<LuUserRound className="size-4 text-foreground/50" />}
          classNames={{ base: "flex-1", inputWrapper: "bg-content1/60 backdrop-blur" }}
        />
        <Button
          type="submit"
          color="primary"
          size="lg"
          radius="lg"
          isLoading={isLoading && phase !== "passkey"}
          isDisabled={phase === "passkey"}
          endContent={!isLoading && <LuArrowRight />}
          className="font-semibold shadow-lg shadow-primary/30 sm:min-w-36"
        >
          {phase === "verifying" ? "Verifying…" : "Start playing"}
        </Button>
      </form>
      {canUsePasskeys && (
        <div className="flex flex-col items-center gap-1 lg:items-start">
          <p className="flex flex-wrap items-center justify-center gap-x-1 text-sm text-foreground/60">
            Played on another device?
            <Button
              variant="light"
              color="primary"
              size="sm"
              radius="full"
              className="font-semibold"
              startContent={phase === "passkey" ? undefined : <LuKeyRound />}
              isLoading={phase === "passkey"}
              isDisabled={isLoading && phase !== "passkey"}
              onPress={handlePasskey}
            >
              Use a passkey
            </Button>
          </p>
          {passkeyError && (
            <p role="alert" className="text-sm text-danger">
              {passkeyError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
