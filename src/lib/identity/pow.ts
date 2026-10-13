/**
 * Hashcash-style proof of work: find a nonce so that SHA-256(`salt:nonce`) starts with `difficulty` zero bits.
 * Finding one costs ~2^difficulty hashes on average; checking one costs a single hash.
 * Isomorphic (Web Crypto only): the browser solves it in a worker and the server verifies it.
 */
const encoder = new TextEncoder();

export async function sha256(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
}

export function countLeadingZeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

export async function checkProof(salt: string, nonce: number, difficulty: number): Promise<boolean> {
  return countLeadingZeroBits(await sha256(`${salt}:${nonce}`)) >= difficulty;
}

export async function solveProof(salt: string, difficulty: number, signal?: AbortSignal): Promise<number> {
  for (let nonce = 0; ; nonce++) {
    if (signal?.aborted) throw new DOMException("Proof of work aborted", "AbortError");
    if (await checkProof(salt, nonce, difficulty)) return nonce;
  }
}
