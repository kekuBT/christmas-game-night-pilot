// Gate self-test fixture: see fixtures.mjs.
process.env.FIXTURE_MODE = "fail";
await import("./fixtures.mjs");
