/**
 * Whether a navigation entry should be highlighted for the current pathname.
 * The root route only matches exactly; other routes also match their children
 * (e.g. `/inspections` is active on `/inspections/abc`).
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  const normalized = href.endsWith("/") ? href.slice(0, -1) : href;
  return pathname === normalized || pathname.startsWith(`${normalized}/`);
}
