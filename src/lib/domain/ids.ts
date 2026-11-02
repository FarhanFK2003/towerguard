import type { ID } from "./types";

/**
 * New random identifier. `crypto.randomUUID()` is only available in secure
 * contexts (HTTPS or localhost), so fail with a clear message elsewhere.
 */
export function newId(): ID {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error(
      "Secure identifiers are unavailable. Open TowerGuard over https:// or http://localhost.",
    );
  }
  return crypto.randomUUID();
}
