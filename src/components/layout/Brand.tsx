import Link from "next/link";
import { RadioTower } from "lucide-react";

export function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500"
    >
      <span
        className="flex size-9 items-center justify-center rounded-md bg-amber-400 text-slate-950"
        aria-hidden="true"
      >
        <RadioTower className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-wide text-white">TowerGuard AI</span>
        <span className="block text-xs text-slate-400">Inspection workspace</span>
      </span>
    </Link>
  );
}
