import Link from "next/link";
import { cn } from "@/lib/cn";
import { isActivePath } from "@/lib/navigation";
import { NAV_ITEMS } from "./nav-items";

const ITEM =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4 [&_svg]:shrink-0";

export interface NavListProps {
  /** Omitted while the pathname is unresolved (Suspense fallback): nothing is highlighted. */
  pathname?: string;
  onNavigate?: () => void;
}

/** Hook-free so it can render both as the static fallback and inside client navigation. */
export function NavList({ pathname, onNavigate }: NavListProps) {
  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
        const active = pathname !== undefined && isActivePath(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                ITEM,
                "focus-visible:outline-2 focus-visible:outline-amber-500",
                active
                  ? "bg-white/10 text-white shadow-[inset_3px_0_0_0_var(--color-amber-400)]"
                  : "text-slate-300 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon aria-hidden="true" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
