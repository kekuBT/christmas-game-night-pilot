// Flat config for ESLint 9. Non-type-checked recommended sets only, so the
// web app (which has no separate tsconfig) lints without project-service setup.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "apps/web/dist/**", "node_modules/**", "docs/**", "test-results/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node-side code: server, tests, driver scripts. Scripts also use browser
    // globals inside page.evaluate callbacks, which run in the page, not Node.
    files: ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      // Underscore-prefixed parameters are intentionally unused contract
      // parameters (e.g. every projection takes actorId/isTv).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Browser code.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
);
