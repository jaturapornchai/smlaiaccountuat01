// เล่นรอบจริงผ่าน scriptFault (src/lib/script-fault.ts): node scripts/check-script-fault.mjs
// script-fault-cases.json = ขั้นจาก run.json ของ ticket ที่ปิด wont_fix "สคริปต์ผิดเอง" (กลุ่ม A-D) และบั๊กจริง (REAL)
// ตัดเหลือขั้นที่ไม่ผ่าน + ขั้นนำหน้าถึงขั้นแรกที่แตะ ERP (พอให้กฎตัดสินเหมือนรอบเต็ม)
// ponytail: ยืม jiti ที่มากับ tailwindcss รัน .ts ตรงๆ — ไม่ต้องเพิ่ม test runner
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const jiti = createRequire(require.resolve("tailwindcss"))("jiti")(import.meta.url, { alias: { "@": new URL("../src", import.meta.url).pathname.replace(/^\/(\w:)/, "$1") } });
const { scriptFault } = jiti("../src/lib/script-fault.ts");
const cases = JSON.parse(readFileSync(new URL("./script-fault-cases.json", import.meta.url), "utf8"));

const by = {};
let bad = 0;
for (const c of cases) {
  const hit = !!scriptFault({ steps: c.steps.map((s) => ({ status: "passed", cleanup: false, ...s })) });
  const ai = /^(ask|auto)-/.test(c.scriptId); // สคริปต์ AI ที่กฎไม่จับ → ด่าน AI (aiTriage) ตัดสินตอนรันจริง
  // B/C ต้องไม่เปิด issue ทุกเรื่อง · บั๊กจริงต้องเปิดเสมอ · A/D แค่รายงาน (ด่าน AI ตัดสินตอนรันจริง)
  const must = c.group === "REAL" ? false : ["B", "C"].includes(c.group) ? true : undefined;
  if (must !== undefined && !(must && ai) && hit !== must) bad++, console.log(`ผิด ${c.ticket} (${c.group}) ${c.scriptId}: scriptFault=${hit}`);
  (by[c.group] ??= []).push(`${c.ticket.slice(9)}${hit ? "✓" : ai ? "(ด่าน AI)" : ""}`);
}
for (const [g, l] of Object.entries(by)) console.log(`${g}: ${l.join(" ")}`);
console.log(bad ? `ไม่ผ่าน ${bad} เรื่อง` : "ผ่าน: B/C กฎจับหรือส่งด่าน AI ทุกเรื่อง, บั๊กจริงยังเปิด");
process.exit(bad ? 1 : 0);
