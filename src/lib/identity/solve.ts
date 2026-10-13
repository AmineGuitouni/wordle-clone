import { solveProof } from "./pow";

/** Solves a challenge in a Web Worker, falling back to the main thread if workers are unavailable or fail. */
export function solveInWorker(salt: string, difficulty: number): Promise<number> {
  if (typeof Worker === "undefined") return solveProof(salt, difficulty);

  return new Promise<number>((resolve, reject) => {
    const worker = new Worker(new URL("./pow.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ nonce: number }>) => {
      worker.terminate();
      resolve(event.data.nonce);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Proof-of-work worker failed"));
    };
    worker.postMessage({ salt, difficulty });
  }).catch(() => solveProof(salt, difficulty));
}
