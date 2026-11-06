// Gate self-test fixture: see fixtures.mjs.
process.env.FIXTURE_MODE = "mutate";
await import("./fixtures.mjs");
