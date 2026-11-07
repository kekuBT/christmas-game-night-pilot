/**
 * `npm run serve:device-test`: the server for real-device acceptance testing
 * (docs/REAL_DEVICE_TESTING.md). The same server as `npm run serve`, with two
 * defaults set for a test night:
 *   - MCHEZO_CONTENT_TEST_MODE=approve-provisional: no content is human-approved
 *     yet, and official quiz games need approved content. TEST MODE ONLY: it is
 *     not a review, and nothing from a test Cup counts as official.
 *   - MCHEZO_DATA_DIR=./data-device-test: test rooms stay apart from ./data.
 * Either can be overridden from the environment. Refused when NODE_ENV=production.
 */
process.env["MCHEZO_CONTENT_TEST_MODE"] ??= "approve-provisional";
process.env["MCHEZO_DATA_DIR"] ??= "./data-device-test";
// Imported after the defaults are set: serve.ts reads them when it loads.
await import("./serve.js");
