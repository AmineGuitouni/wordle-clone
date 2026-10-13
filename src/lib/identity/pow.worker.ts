import { solveProof } from "./pow";

// Runs the hashing loop off the main thread so the page stays responsive while the challenge is solved.
self.addEventListener("message", async (event: MessageEvent<{ salt: string; difficulty: number }>) => {
  const nonce = await solveProof(event.data.salt, event.data.difficulty);
  self.postMessage({ nonce });
});
