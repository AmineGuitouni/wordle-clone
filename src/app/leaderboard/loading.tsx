export default function Loading() {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12"
      aria-busy="true"
      aria-label="Loading leaderboard"
    >
      <div className="h-10 w-72 max-w-full animate-pulse rounded-lg bg-foreground/10" />
      <div className="flex flex-col gap-px overflow-hidden rounded-2xl">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse bg-foreground/10" />
        ))}
      </div>
    </div>
  );
}
