"use client";

import { usePathname } from "next/navigation";
import { NavList } from "./NavList";

/**
 * Reads the pathname to highlight the active entry. With `cacheComponents`
 * enabled this can suspend on dynamic routes, so callers must wrap it in
 * `<Suspense fallback={<NavList />}>`.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <NavList pathname={pathname} onNavigate={onNavigate} />;
}
