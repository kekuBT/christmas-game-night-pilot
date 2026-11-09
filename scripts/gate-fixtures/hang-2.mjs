// Gate self-test fixture: see fixtures.mjs.
process.env.FIXTURE_MODE = "hang";
await import("./fixtures.mjs");
