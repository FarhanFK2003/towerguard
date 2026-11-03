import Link from "next/link";
import { RadioTower } from "lucide-react";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/product";

/** `compact` hides the tagline on narrow screens (the mobile top bar has room for one line). */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-400 text-slate-950"
        aria-hidden="true"
      >
        <RadioTower className="size-5" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-semibold tracking-wide text-white">{PRODUCT_NAME}</span>
        <span className={compact ? "hidden text-xs text-slate-400 sm:block" : "block text-xs text-slate-400"}>
          {PRODUCT_TAGLINE}
        </span>
      </span>
    </Link>
  );
}
