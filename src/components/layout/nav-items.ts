import type { LucideIcon } from "lucide-react";
import { ClipboardPlus, LayoutDashboard } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "New inspection", href: "/inspections/new", icon: ClipboardPlus },
];
