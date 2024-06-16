"use client"
import React from "react";
import {Navbar, NavbarBrand, NavbarContent, NavbarItem, NavbarMenuToggle, NavbarMenu, NavbarMenuItem, Link, Button, User, PopoverContent, PopoverTrigger, Popover} from "@nextui-org/react";
import { BiLogoWordpress } from "react-icons/bi";
import LoginWithGoogleBtn from "../authantication/loginWithGoogleBtn";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import SigneOut from "../authantication/signeOut";
import { Session } from "next-auth";

export default function NavBar({session}:{session:Session|null}) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const pathName = usePathname()

  return (
    <Navbar onMenuOpenChange={setIsMenuOpen} isBlurred maxWidth="2xl" isBordered>
      <NavbarContent>
        <NavbarMenuToggle
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          className="sm:hidden"
        />
        <NavbarBrand className="flex gap-2 text-xl">
          <BiLogoWordpress className="text-2xl"/> <p className="font-bold text-inherit">Wordle</p>
        </NavbarBrand>
      </NavbarContent>

      <NavbarContent className="hidden sm:flex gap-4" justify="center">
        <NavbarItem>
          <Link size="lg" as={NextLink} color="foreground" underline={pathName === "/game" ? "always" : "none"} href="/game">
            Game
          </Link>
        </NavbarItem>
        <NavbarItem isActive>
          <Link size="lg" as={NextLink} color="foreground" href="#" underline={pathName === "/about" ? "always" : "none"} aria-current="page">
            About
          </Link>
        </NavbarItem>
      </NavbarContent>
      <NavbarContent justify="end">
        <NavbarItem>
          {session ? (
            <Popover placement="bottom" showArrow={true}>
            <PopoverTrigger>
                <User
                  className="cursor-pointer select-none"   
                  name={session.user?.name ? session.user.name : "user"}
                  description={session.user?.email ? session.user.email : "email"}
                  avatarProps={{
                    src: session.user?.image ? session.user.image : undefined
                  }}
                />
            </PopoverTrigger>
            <PopoverContent>
              <div className="px-1 py-2">
                <SigneOut/>
              </div>
            </PopoverContent>
          </Popover>
          ) :<LoginWithGoogleBtn/>}
        </NavbarItem>
      </NavbarContent>
      <NavbarMenu>
      <NavbarMenuItem>
            <Link
                as={NextLink}
                color="foreground"
                className="w-full"
                href="/game"
                size="lg"
                underline={pathName === "/game" ? "always" : "none"}
            >
                Game
            </Link>
            <Link
                as={NextLink}
                color="foreground"
                className="w-full"
                href="#"
                size="lg"
                underline={pathName === "/about" ? "always" : "none"}
            >
                About
            </Link>
          </NavbarMenuItem>
      </NavbarMenu>
    </Navbar>
  );
}