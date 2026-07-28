"use client";

import { liveQuery } from "dexie";
import { useEffect, useRef, useState } from "react";
import { driveSync } from "@/lib/sync";

/**
 * The two things every page needs now that the server is gone.
 *
 * `useLive` keeps a component subscribed to a Dexie query. A one-shot
 * `useEffect` fetch would go stale the moment a Drive pull merges remote
 * records into IndexedDB behind the user's back — they would sit looking at a
 * table that no longer matches what is stored. `liveQuery` re-runs the query on
 * every write to the tables it touched, whether the write came from this tab or
 * from the sync layer.
 *
 * `mutate` wraps a write so the sync layer learns about it. The old code
 * detected mutations by monkey-patching `window.fetch`; there are no requests
 * to intercept any more, so every write has to say so explicitly. A mutation
 * that skips this never reaches Drive, and the user finds out on their other
 * device.
 */

export interface LiveResult<T> {
  data: T | undefined;
  /** True until the first result arrives. */
  loading: boolean;
  error: Error | null;
}

export function useLive<T>(
  query: () => Promise<T>,
  deps: readonly unknown[]
): LiveResult<T> {
  const [state, setState] = useState<LiveResult<T>>({
    data: undefined,
    loading: true,
    error: null,
  });

  // Held in a ref so the subscription depends only on `deps` — an inline
  // arrow function is a new identity on every render and would otherwise
  // resubscribe (and re-fetch) forever.
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    setState((prev) => ({ ...prev, loading: true }));
    const subscription = liveQuery(() => queryRef.current()).subscribe({
      next: (value) => setState({ data: value, loading: false, error: null }),
      error: (err: unknown) =>
        setState({
          data: undefined,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }),
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

/**
 * Run a write and tell the sync layer the database changed.
 *
 * `markDirty` is only called on success — a rejected write changed nothing, and
 * flagging it would push an identical snapshot for no reason.
 */
export async function mutate<T>(write: () => Promise<T>): Promise<T> {
  const result = await write();
  driveSync.markDirty();
  return result;
}
