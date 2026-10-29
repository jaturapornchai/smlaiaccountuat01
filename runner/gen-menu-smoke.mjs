// สร้างสคริปต์สำรวจ "เปิดได้ทุกเมนู" จากทะเบียนเมนู src/lib/erp-menus.json → uat-scripts/smoke-*.json
// รัน: node runner/gen-menu-smoke.mjs  (ทะเบียนเมนูเปลี่ยน → สร้าง erp-menus.json ใหม่ตาม README แล้วรันซ้ำ)
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";

const CHUNK = 40; // ponytail: 40 เมนู/สคริปต์ ≈ 4 นาที; คิวรันพร้อมกันตาม maxParallelBots
const GROUPS = { เริ่มต้น: ["setup", "master"], สินค้า: ["stock", "inventory"], ซื้อ: ["buy", "purchase"], ขาย: ["sell", "sales"], เจ้าหนี้: ["ap", "purchase"], ลูกหนี้: ["ar", "sales"], "เงินสด/ธนาคาร": ["cash", "gl"], ค่าเสื่อม: ["asset", "gl"], บัญชี: ["gl", "gl"] };
const isReport = (key, text) => /รายงาน/.test(text) || /report/.test(key); // ต้องตรงกับ src/lib/delivery.ts

const menus = JSON.parse(readFileSync("src/lib/erp-menus.json", "utf8"));
for (const f of readdirSync("uat-scripts")) if (f.startsWith("smoke-")) unlinkSync(`uat-scripts/${f}`);

let files = 0, covered = 0;
for (const [group, [slug, module]] of Object.entries(GROUPS)) {
  for (const report of [false, true]) {
    const list = menus.filter(([k, t, g]) => g === group && isReport(k, t) === report);
    const parts = Math.ceil(list.length / CHUNK);
    for (let p = 0; p < parts; p++) {
      const chunk = list.slice(p * CHUNK, (p + 1) * CHUNK);
      const kind = report ? "รายงาน" : "เมนู";
      const id = `smoke-${slug}-${report ? "report" : "menu"}-${p + 1}`;
      const steps = [
        { title: "เข้าสู่ระบบแบบ Demo", do: "ui.demoLogin" },
        { title: "ล้างตัวนับข้อผิดพลาดหลังเข้าสู่ระบบ", do: "ui.expectClean", reset: true },
        ...chunk.flatMap(([key, text]) => [
          { title: `เปิด${kind} ${text}`, do: "ui.openMenu", key, timeout: 20000, continueOnFail: true },
          { title: `ไม่มีข้อผิดพลาดแฝงในหน้า ${text}`, do: "ui.expectClean", ignore: ["^HTTP 401 GET /api/auth/"], continueOnFail: true },
        ]),
      ];
      const script = {
        id,
        title: `สำรวจเปิด${kind}ทุกตัว: ${group}${parts > 1 ? ` (ชุด ${p + 1}/${parts})` : ""}`,
        module: report ? "reports" : module,
        lens: "screen",
        severityOnFail: "S2",
        timeoutMs: 60000 + chunk.length * 25000,
        description: `เปิด${kind}กลุ่ม ${group} ${chunk.length} รายการทีละตัว แล้วตรวจว่าแผงเปิดได้ และไม่มี HTTP 4xx/5xx, JS error, DB error · ไม่กดบันทึก ไม่แก้ข้อมูล`,
        steps,
      };
      writeFileSync(`uat-scripts/${id}.json`, JSON.stringify(script, null, 2) + "\n");
      files++, (covered += chunk.length);
    }
  }
}
console.log(`สร้าง ${files} สคริปต์ ครอบคลุม ${covered}/${menus.length} เมนู`);
