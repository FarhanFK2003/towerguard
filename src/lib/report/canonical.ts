/**
 * Deterministic JSON: object keys sorted alphabetically at every level,
 * `undefined` properties dropped, array order preserved. Equal data always
 * produces byte-identical text, regardless of property insertion order.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) sorted[key] = canonicalize(record[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalJson(value: unknown, indent?: number): string {
  return JSON.stringify(canonicalize(value), null, indent);
}
