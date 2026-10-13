"use client";

import { Button, Input } from "@heroui/react";
import { signIn } from "next-auth/react";
import { type FormEvent, useState } from "react";
import { LuArrowRight, LuUserRound } from "react-icons/lu";
import { GUEST_NAME_HINT, GUEST_NAME_MAX, normalizeGuestName } from "@/lib/validation";

export default function GuestLoginForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const guestName = normalizeGuestName(name);
    if (!guestName) {
      setError(GUEST_NAME_HINT);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn("guest", { name: guestName, redirect: false });
      if (result?.error) throw new Error(result.error);
      // A full reload re-renders the server layout with the new session; the proxy then sends "/" to "/game".
      window.location.reload();
    } catch {
      setError("We couldn't start your session. Please try again.");
      setIsLoading(false);
    }
  }

  return (
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
        isLoading={isLoading}
        endContent={!isLoading && <LuArrowRight />}
        className="font-semibold shadow-lg shadow-primary/30 sm:min-w-36"
      >
        Start playing
      </Button>
    </form>
  );
}
