import Image from "next/image";
import { LuCalendarDays, LuTrophy, LuZap } from "react-icons/lu";
import GuestLoginForm from "@/components/auth/GuestLoginForm";
import DemoBoard from "@/components/landing/DemoBoard";
import logo from "../../public/logo.png";

const FEATURES = [
  { Icon: LuZap, title: "No sign-up", text: "Pick a name and start guessing in seconds." },
  { Icon: LuCalendarDays, title: "A fresh word", text: "A new five-letter puzzle keeps coming." },
  { Icon: LuTrophy, title: "Live leaderboard", text: "Race the clock and the other players." },
];

export default function Home() {
  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-16">
      <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
        <span className="rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          Daily word puzzle
        </span>
        <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          Six tries to find the{" "}
          <span className="bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">
            hidden word
          </span>
          .
        </h1>
        <p className="max-w-lg text-lg text-foreground/70">
          Guess the five-letter word, learn from the colours, and see how you stack up against everyone playing today.
        </p>

        <div className="w-full max-w-xl">
          <GuestLoginForm />
        </div>

        <ul className="mt-2 grid w-full max-w-xl grid-cols-3 gap-3 sm:gap-4">
          {FEATURES.map(({ Icon, title, text }) => (
            <li key={title} className="flex flex-col items-center gap-1 lg:items-start">
              <Icon className="size-5 text-primary" aria-hidden />
              <p className="text-sm font-semibold sm:text-base">{title}</p>
              <p className="hidden text-sm text-foreground/60 sm:block">{text}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-center">
        <div className="flex flex-col items-center gap-6 rounded-3xl border border-foreground/10 bg-content1/60 p-6 shadow-2xl shadow-primary/20 backdrop-blur sm:p-8">
          <Image src={logo} alt="Guess the Word" priority className="h-auto w-44 drop-shadow-lg" />
          <DemoBoard />
        </div>
      </div>
    </div>
  );
}
