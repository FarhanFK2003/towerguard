import { PhotoError } from "./errors";

/** Lower-case hex SHA-256 of the given bytes, using the built-in Web Crypto API. */
export async function sha256Hex(data: Blob | ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new PhotoError(
      "unavailable",
      "Secure hashing is unavailable. Open TowerGuard over https:// or http://localhost.",
    );
  }
  const bytes = data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
