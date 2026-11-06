import { defineConfig } from "vitest/config";

// Test content mode (src/content/registry.ts contentTestMode): provisional
// content counts as approved so suites can play many official games in one
// Cup. The shipped library's real approval state is still checked by
// tests/content.test.ts, which loads it without this mode.
export default defineConfig({
  test: { env: { MCHEZO_CONTENT_TEST_MODE: "approve-provisional" } },
});
