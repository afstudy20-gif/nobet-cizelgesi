import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    // fake-indexeddb installs `indexedDB`/`IDBKeyRange` on the global object.
    setupFiles: ["./vitest.setup.ts"],
    // scrypt at N=2^14 costs ~100ms per derivation by design.
    testTimeout: 20_000,
  },
});
