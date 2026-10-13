"use client";

import {
  Avatar,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuItem,
  NavbarMenuToggle,
} from "@heroui/react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { LuLogOut } from "react-icons/lu";
import { cn } from "@/lib/utils";
import BrandMark from "./BrandMark";
import ThemeToggle from "./ThemeToggle";

type NavUser = { name: string; image: string | null };

const linkClass = (active: boolean) =>
  cn(
    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
    active ? "bg-primary/15 text-primary" : "text-foreground/70 hover:bg-foreground/10 hover:text-foreground",
  );

export default function NavBar({ user }: { user: NavUser | null }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { href: user ? "/game" : "/", label: "Play", active: pathname === "/game" || pathname === "/" },
    { href: "/leaderboard", label: "Leaderboard", active: pathname === "/leaderboard" },
  ];

  return (
    <Navbar
      isBordered
      isBlurred
      maxWidth="xl"
      height="4rem"
      isMenuOpen={isMenuOpen}
      onMenuOpenChange={setIsMenuOpen}
      classNames={{ base: "bg-background/60 border-foreground/10" }}
    >
      <NavbarContent justify="start">
        <NavbarMenuToggle aria-label={isMenuOpen ? "Close menu" : "Open menu"} className="sm:hidden" />
        <NavbarBrand>
          <NextLink href={user ? "/game" : "/"} className="flex items-center gap-2.5" aria-label="Guess the Word home">
            <BrandMark />
            <span className="font-display text-lg font-bold tracking-tight">Guess the Word</span>
          </NextLink>
        </NavbarBrand>
      </NavbarContent>

      <NavbarContent className="hidden gap-1 sm:flex" justify="center">
        {links.map((link) => (
          <NavbarItem key={link.label} isActive={link.active}>
            <NextLink
              href={link.href}
              className={linkClass(link.active)}
              aria-current={link.active ? "page" : undefined}
            >
              {link.label}
            </NextLink>
          </NavbarItem>
        ))}
      </NavbarContent>

      <NavbarContent justify="end" className="gap-1">
        <NavbarItem>
          <ThemeToggle />
        </NavbarItem>
        {user && (
          <NavbarItem>
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Avatar isBordered color="primary" size="sm" name={user.name} src={user.image ?? undefined} />
                </button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Account"
                onAction={(key) => {
                  if (key === "sign-out") void signOut({ redirectTo: "/" });
                }}
              >
                <DropdownItem key="profile" isReadOnly className="cursor-default opacity-100" textValue={user.name}>
                  <p className="text-xs text-foreground/60">Playing as</p>
                  <p className="font-semibold">{user.name}</p>
                </DropdownItem>
                <DropdownItem key="sign-out" color="danger" className="text-danger" startContent={<LuLogOut />}>
                  Sign out
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </NavbarItem>
        )}
        {!user && (
          <NavbarItem className="hidden sm:flex">
            <Button as={NextLink} href="/" color="primary" radius="full" size="sm" className="font-semibold">
              Play now
            </Button>
          </NavbarItem>
        )}
      </NavbarContent>

      <NavbarMenu className="gap-2 pt-6">
        {links.map((link) => (
          <NavbarMenuItem key={link.label} isActive={link.active}>
            <NextLink
              href={link.href}
              onClick={() => setIsMenuOpen(false)}
              className={cn("block w-full text-lg", linkClass(link.active), "py-3")}
              aria-current={link.active ? "page" : undefined}
            >
              {link.label}
            </NextLink>
          </NavbarMenuItem>
        ))}
      </NavbarMenu>
    </Navbar>
  );
}
