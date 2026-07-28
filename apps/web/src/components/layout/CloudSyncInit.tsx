"use client";

import { useEffect } from "react";
import { driveSync } from "@/lib/sync";

export function CloudSyncInit() {
  useEffect(() => {
    driveSync.init().catch((e) => {
      console.warn("[CloudSyncInit] Failed to initialize drive sync:", e);
    });
  }, []);

  return null;
}
