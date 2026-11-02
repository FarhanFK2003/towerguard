import type { LucideIcon } from "lucide-react";
import { ClipboardPlus, LayoutDashboard } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Routes not built yet render as disabled entries instead of dead links. */
  available: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, available: true },
  { label: "New inspection", href: "/inspections/new", icon: ClipboardPlus, available: true },
];
