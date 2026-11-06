// Gate self-test fixture: see fixtures.mjs.
process.env.FIXTURE_MODE = "touch-tracked";
await import("./fixtures.mjs");
