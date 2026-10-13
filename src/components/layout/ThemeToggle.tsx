"use client";

import { Button } from "@heroui/react";
import { useTheme } from "next-themes";
import { LuMoon, LuSun } from "react-icons/lu";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      isIconOnly
      variant="light"
      radius="full"
      size="sm"
      aria-label="Toggle light and dark theme"
      onPress={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* Both icons are rendered and swapped with CSS so server and client markup always match. */}
      <LuSun className="hidden size-5 dark:block" />
      <LuMoon className="size-5 dark:hidden" />
    </Button>
  );
}
