"use client";

import { useEffect } from "react";
import { init } from "@/lib/cloud-sync";

export function CloudSyncInit() {
  useEffect(() => {
    init().catch((e) => {
      console.warn("[CloudSyncInit] Failed to initialize cloud sync:", e);
    });
  }, []);

  return null;
}
