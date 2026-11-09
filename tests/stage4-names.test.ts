/** Stage 4 (S3-TRV-02): similar names stay distinguishable in tight spots. */
import { describe, expect, it } from "vitest";
import { shortNames } from "../apps/web/src/ui/mchezo/lib/names.js";

const P = (...names: string[]) => names.map((name, i) => ({ id: `p${i}`, name }));
const labels = (...names: string[]) => Object.values(shortNames(P(...names)));

describe("shortNames", () => {
  it("unique first words are enough", () => {
    expect(labels("Keku", "Amina Wanjiku", "Bartholomew Otieno")).toEqual(["Keku", "Amina", "Bartholomew"]);
  });
  it("the audit's names: 'Audit Host', 'Audit Guest', 'Audit Third' are told apart", () => {
    expect(labels("Audit Host", "Audit Guest", "Audit Third")).toEqual(["Audit H.", "Audit G.", "Audit T."]);
  });
  it("still colliding after the initial: full names", () => {
    expect(labels("Mary Smith", "Mary Stone", "Keku")).toEqual(["Mary Smith", "Mary Stone", "Keku"]);
  });
  it("a single-word name that collides keeps its full name; case doesn't matter", () => {
    expect(labels("Ada", "ada Lovelace")).toEqual(["Ada", "ada L."]);
  });
  it("every label comes from that player's own name, and ten similar names give ten different labels", () => {
    const names = Array.from({ length: 10 }, (_, i) => `Cousin ${["Amani", "Baraka", "Chausiku", "Daudi", "Eshe", "Faraji", "Gathoni", "Hamisi", "Imani", "Jabari"][i]}`);
    const out = labels(...names);
    expect(new Set(out).size).toBe(10);
    out.forEach((l, i) => expect(names[i]!.startsWith(l.replace(/ .\.$/, ""))).toBe(true));
  });
});
