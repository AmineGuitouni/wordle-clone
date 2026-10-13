import { cn } from "@/lib/utils";

/** Four mini tiles on the brand blue; mirrors the favicon in `app/icon.svg`. */
export default function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 grid-cols-2 gap-[3px] rounded-lg bg-primary p-[5px] shadow-md shadow-primary/30",
        className,
      )}
    >
      <i className="rounded-[3px] bg-[#5a9b52]" />
      <i className="rounded-[3px] bg-[#c8a72c]" />
      <i className="rounded-[3px] bg-white" />
      <i className="rounded-[3px] bg-[#5a9b52]" />
    </span>
  );
}
