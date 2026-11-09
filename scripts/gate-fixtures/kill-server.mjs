// Gate self-test fixture: see fixtures.mjs.
process.env.FIXTURE_MODE = "kill-server";
await import("./fixtures.mjs");
