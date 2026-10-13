export const GUEST_NAME_MIN = 2;
export const GUEST_NAME_MAX = 24;

const GUEST_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _.'-]*$/u;

/** Collapses whitespace and validates a display name; returns null when it is unacceptable. */
export function normalizeGuestName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length < GUEST_NAME_MIN || name.length > GUEST_NAME_MAX) return null;
  return GUEST_NAME_PATTERN.test(name) ? name : null;
}

export const GUEST_NAME_HINT = `Use ${GUEST_NAME_MIN}–${GUEST_NAME_MAX} letters, numbers, spaces, or . _ ' -`;
