// Stage 11.1 (D-S111-04): regenerate apps/web/src/ui/mchezo/tokens/tokens.css from tokens.ts.
// Usage: npm run gen:tokens   (runs under tsx, which loads the TypeScript source)
// tests/stage111-warm-ivory.test.ts fails if the file on disk and tokens.ts disagree.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tokensCss } from "../apps/web/src/ui/mchezo/tokens/tokens.ts";

const out = fileURLToPath(new URL("../apps/web/src/ui/mchezo/tokens/tokens.css", import.meta.url));
writeFileSync(out, tokensCss());
console.log(`wrote ${out}`);
