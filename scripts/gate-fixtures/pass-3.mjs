// Gate self-test fixture: see fixtures.mjs.
process.env.FIXTURE_MODE = "pass";
await import("./fixtures.mjs");
