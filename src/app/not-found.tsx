import NextLink from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-display text-7xl font-bold text-primary">404</p>
      <h1 className="font-display text-2xl font-bold">That word isn&apos;t in our list</h1>
      <p className="max-w-md text-foreground/70">The page you are looking for doesn&apos;t exist or has moved.</p>
      <NextLink
        href="/"
        className="rounded-xl bg-primary px-6 py-2.5 font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105"
      >
        Back to the game
      </NextLink>
    </div>
  );
}
