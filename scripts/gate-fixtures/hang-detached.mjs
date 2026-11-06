// Gate self-test fixture: see fixtures.mjs.
process.env.FIXTURE_MODE = "hang-detached";
await import("./fixtures.mjs");
