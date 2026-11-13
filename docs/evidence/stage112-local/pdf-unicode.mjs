import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const { jsPDF } = require("jspdf");
const doc = new jsPDF();
for (const [i, s] of ["From the ledger: Zoë: 120 points", "From the ledger: 李雷: 120 points", "From the ledger: Amani 🎄: 120 points", "From the ledger: Ἀθηνᾶ: 120 points"].entries()) {
  try { doc.text(doc.splitTextToSize(s, 180), 10, 20 + i * 10); console.log("ok", JSON.stringify(s)); } catch (e) { console.log("throws", JSON.stringify(s), String(e).slice(0, 120)); }
}
const raw = Buffer.from(doc.output("arraybuffer")).toString("latin1");
for (const m of raw.matchAll(/\((From the ledger[^\n]*?)\) Tj/g)) console.log("PDF:", JSON.stringify(m[1]));
for (const m of raw.matchAll(/<([0-9A-Fa-f]{20,})> Tj/g)) console.log("PDF hex:", m[1].slice(0, 80));
console.log("---- raw text operators");
for (const line of raw.split("\n").filter((l) => /Tj|TJ/.test(l))) console.log(JSON.stringify(line.slice(0, 160)));
