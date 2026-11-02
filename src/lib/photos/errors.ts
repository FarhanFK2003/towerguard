export type PhotoErrorCode =
  | "empty"
  | "too_large"
  | "unsupported_type"
  | "decode_failed"
  | "unavailable"
  | "insufficient_storage";

/** A photograph could not be accepted or processed. `message` is user-facing. */
export class PhotoError extends Error {
  readonly code: PhotoErrorCode;

  constructor(code: PhotoErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PhotoError";
    this.code = code;
  }
}
