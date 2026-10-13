"use client";

import { useSyncExternalStore } from "react";
import { isPasskeySupported } from "@/lib/identity/passkey-client";

const subscribe = () => () => {};

/** Whether this browser can use passkeys. False during server rendering, so passkey UI only appears client-side. */
export function usePasskeySupport(): boolean {
  return useSyncExternalStore(subscribe, isPasskeySupported, () => false);
}
