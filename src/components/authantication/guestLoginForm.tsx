"use client";

import { Button, Input } from "@heroui/react";
import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";

type ButtonColor =
  | "primary"
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "danger";

export default function GuestLoginForm({
  buttonText = "Play as Guest",
  color = "primary",
  className,
  compact = false,
}: {
  buttonText?: string;
  color?: ButtonColor;
  className?: string;
  compact?: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim().replace(/\s+/g, " ");

    if (normalizedName.length < 2 || normalizedName.length > 24) {
      setError("Choose a name between 2 and 24 characters.");
      return;
    }

    setError("");
    setIsLoading(true);

    const result = await signIn("guest", {
      name: normalizedName,
      callbackUrl: "/game",
      redirect: false,
    });

    if (result?.error) {
      setError("We could not create your guest session. Please try again.");
      setIsLoading(false);
      return;
    }

    window.location.assign(result?.url ?? "/game");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={className ?? (compact ? "flex items-center gap-2" : "flex w-full max-w-sm flex-col gap-3")}
    >
      <Input
        aria-label="Choose your name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Choose your name"
        minLength={2}
        maxLength={24}
        isInvalid={Boolean(error)}
        errorMessage={error}
        size={compact ? "sm" : "md"}
        className={compact ? "w-36 sm:w-48" : "w-full"}
      />
      <Button
        type="submit"
        radius="full"
        color={color}
        variant="solid"
        size={compact ? "sm" : "md"}
        isLoading={isLoading}
        className={compact ? "shrink-0" : "w-full"}
      >
        {buttonText}
      </Button>
    </form>
  );
}
