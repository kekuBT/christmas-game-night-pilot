import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const { jsPDF } = require("jspdf");
const samples = ["Keku’s night", "Keku's night", "“quoted”", "a — b", "a – b", "€5", "Šárka", "Łukasz", "Şule", "Œuvre", "…", "•", "Zoë", "ñ", "ß"];
for (const s of samples) {
  const doc = new jsPDF();
  doc.text(s, 10, 10);
  const raw = Buffer.from(doc.output("arraybuffer")).toString("latin1");
  const line = raw.split("\n").find((l) => / Tj$/.test(l)) ?? "";
  console.log(line.includes("\u0000") ? "GARBLED" : "ok     ", JSON.stringify(s), JSON.stringify(line.slice(0, 60)));
}
console.log("jspdf", require("jspdf/package.json").version);
