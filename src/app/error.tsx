"use client";

import { Button } from "@heroui/react";
import NextLink from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-4xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-foreground/70">
        We couldn&apos;t load this page. This is usually temporary — try again in a moment.
      </p>
      <div className="flex gap-3">
        <Button color="primary" radius="lg" onPress={reset} className="font-semibold">
          Try again
        </Button>
        <Button as={NextLink} href="/" variant="bordered" radius="lg" className="font-semibold">
          Go home
        </Button>
      </div>
    </div>
  );
}
