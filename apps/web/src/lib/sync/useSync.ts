"use client";

import { useEffect, useState } from "react";
import { driveSync, type SyncState } from "./drive";

/**
 * React binding over `driveSync`. Subscribes to `onChange` and returns the
 * current `SyncState` plus bound `connect` / `syncNow` / `setAuto` callbacks.
 *
 * SSR-safe: the initial render uses the singleton's current state without
 * touching `localStorage`, and the subscription is set up in an effect. The app
 * still builds through Next.js App Router.
 */
export function useSync(): {
  state: SyncState;
  connect: () => Promise<void>;
  syncNow: () => Promise<void>;
  setAuto: (on: boolean) => void;
} {
  const [state, setState] = useState<SyncState>(() => driveSync.state());

  useEffect(() => {
    // Re-read on mount in case the singleton was constructed before window
    // existed (SSR), then subscribe for all subsequent changes.
    setState(driveSync.state());
    const unsubscribe = driveSync.onChange(setState);
    return unsubscribe;
  }, []);

  return {
    state,
    connect: () => driveSync.connect(),
    syncNow: () => driveSync.syncNow(),
    setAuto: (on: boolean) => driveSync.setAuto(on),
  };
}
