/**
 * The preview probe's classifier (scripts/preview/probe-forwarded-origin.mjs, review 6903845075): offline, with benign
 * in-memory header records only, and no requests to anything. It must count only what was observed at the target: a
 * comparison request that never arrived is missing evidence, never proof that the forwarder stopped it, and the other
 * page's "done" marker is a hint for the operator, never evidence.
 */
import { describe, expect, it } from "vitest";
import { classify, type ProbeEntry } from "../scripts/preview/probe-forwarded-origin.mjs";

const URLS = { targetUrl: "https://cs-3153.app.github.dev", otherUrl: "https://cs-3156.app.github.dev" };
const TARGET = "https://cs-3153.app.github.dev", OTHER = "https://cs-3156.app.github.dev", REWRITTEN = "https://localhost:3153";
const own = (origin: string | null, kinds = ["fetch-post", "form-post", "ws"]): ProbeEntry[] => kinds.map((kind) => ({ where: "target", kind, origin }));
const cmp = (origin: string | null, kinds = ["xorigin-fetch-post", "xorigin-form-post", "xorigin-ws"]): ProbeEntry[] => kinds.map((kind) => ({ where: "target", kind, origin }));
const done: ProbeEntry = { where: "other", kind: "done", origin: OTHER };

describe("the review's three false passes now fail closed", () => {
  it("three agreeing own samples and the done marker, with no comparison sample, is INCOMPLETE (absence is not proof)", () => {
    const r = classify([...own(REWRITTEN), done], URLS);
    expect(r.verdict).toBe("INCOMPLETE");
    expect(r.ownOrigin).toBeUndefined();
    expect(r.why).toMatch(/fetch POST: nothing observed; form POST: nothing observed; WebSocket: nothing observed/);
  });
  it("one comparison sample and two missing is INCOMPLETE, naming the two", () => {
    const r = classify([...own(REWRITTEN), ...cmp(OTHER, ["xorigin-fetch-post"]), done], URLS);
    expect(r.verdict).toBe("INCOMPLETE");
    expect(r.why).toMatch(/form POST: nothing observed; WebSocket: nothing observed/);
    expect(r.why).not.toMatch(/fetch POST: nothing/);
  });
  it("own requests with no Origin header are refused (UNSUITABLE), with no ownOrigin", () => {
    const r = classify([...own(null), ...cmp(OTHER), done], URLS);
    expect(r.verdict).toBe("UNSUITABLE");
    expect(r.ownOrigin).toBeUndefined();
  });
});

describe("a complete, consistent record passes with the correct origin", () => {
  it("rewritten own origin, all three comparison transports positively observed: REWRITTEN_SAME_ORIGIN_ONLY", () => {
    const r = classify([...cmp(OTHER), done, ...own(REWRITTEN)], URLS);
    expect(r).toMatchObject({ verdict: "REWRITTEN_SAME_ORIGIN_ONLY", ownOrigin: REWRITTEN });
    expect(r.why).toMatch(/only the traffic observed/);
  });
  it("the done marker changes nothing: the same record without it still passes, and is labelled a hint either way", () => {
    expect(classify([...cmp(OTHER), ...own(REWRITTEN)], URLS)).toMatchObject({ verdict: "REWRITTEN_SAME_ORIGIN_ONLY", ownOrigin: REWRITTEN });
    expect(classify([...cmp(OTHER), done, ...own(REWRITTEN)], URLS).hint).toMatch(/only a hint, not evidence/);
  });
  it("preserved own origin under the same rules: PRESERVED", () => {
    expect(classify([...own(TARGET), ...cmp(OTHER), done], URLS)).toMatchObject({ verdict: "PRESERVED", ownOrigin: TARGET });
  });
  it("preserved own origin without the comparison evidence is INCOMPLETE, not PRESERVED", () => {
    expect(classify([...own(TARGET), done], URLS).verdict).toBe("INCOMPLETE");
  });
});

describe("refusals: known conflicting evidence", () => {
  it("a comparison request with the target's own value is UNSAFE, even alongside positive ones", () => {
    expect(classify([...own(REWRITTEN), ...cmp(OTHER), ...cmp(REWRITTEN, ["xorigin-ws"])], URLS).verdict).toBe("UNSAFE");
  });
  it("a comparison request with no Origin is UNSAFE, even when the own requests are missing", () => {
    expect(classify([...cmp(null, ["xorigin-form-post"])], URLS).verdict).toBe("UNSAFE");
    expect(classify([...own(REWRITTEN), ...cmp(OTHER), ...cmp(null, ["xorigin-fetch-post"])], URLS).verdict).toBe("UNSAFE");
  });
  it("own requests with different Origins (e.g. the WebSocket not rewritten) are INCONSISTENT", () => {
    expect(classify([...own(REWRITTEN, ["fetch-post", "form-post"]), ...own(TARGET, ["ws"]), ...cmp(OTHER)], URLS).verdict).toBe("INCONSISTENT");
  });
  it("an own Origin that isn't a valid https origin is UNSUITABLE: http, the string \"null\", a path, garbage", () => {
    for (const bad of ["http://localhost:3153", "null", "https://localhost:3153/x", "not a url", ""]) {
      expect(classify([...own(bad), ...cmp(OTHER)], URLS).verdict, bad).toBe("UNSUITABLE");
    }
    expect(classify([...own(REWRITTEN, ["fetch-post", "form-post"]), ...own("http://localhost:3153", ["ws"]), ...cmp(OTHER)], URLS).verdict).toBe("UNSUITABLE");
  });
  it("own requests carrying the comparison page's origin are UNSUITABLE", () => {
    expect(classify([...own(OTHER), ...cmp(OTHER)], URLS).verdict).toBe("UNSUITABLE");
  });
});

describe("missing or unattributed observations are INCOMPLETE", () => {
  it("a missing own transport is INCOMPLETE, naming it", () => {
    const r = classify([...own(REWRITTEN, ["fetch-post", "ws"]), ...cmp(OTHER)], URLS);
    expect(r.verdict).toBe("INCOMPLETE");
    expect(r.why).toMatch(/form POST/);
  });
  it("comparison requests carrying another Origin (\"null\", a third site) don't count as positive evidence", () => {
    const r = classify([...own(REWRITTEN), ...cmp(OTHER, ["xorigin-fetch-post", "xorigin-ws"]), ...cmp("null", ["xorigin-form-post"]), ...cmp("https://third.example", ["xorigin-form-post"])], URLS);
    expect(r.verdict).toBe("INCOMPLETE");
    expect(r.why).toMatch(/form POST: only "null", "https:\/\/third.example" \(unattributed\)/);
  });
  it("observations recorded on the other server, or of unknown kinds, never count for the target", () => {
    const elsewhere: ProbeEntry[] = cmp(OTHER).map((e) => ({ ...e, where: "other" }));
    expect(classify([...own(REWRITTEN), ...elsewhere, done], URLS).verdict).toBe("INCOMPLETE");
    const unknown: ProbeEntry[] = [{ where: "target", kind: "xorigin-something", origin: OTHER }, { where: "target", kind: "/probe", origin: OTHER }];
    expect(classify([...own(REWRITTEN), ...unknown], URLS).verdict).toBe("INCOMPLETE");
  });
  it("nothing at all is INCOMPLETE", () => {
    expect(classify([], URLS).verdict).toBe("INCOMPLETE");
  });
});
