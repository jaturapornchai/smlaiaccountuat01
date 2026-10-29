// ตัวตรวจ pollDeployed ด้วย IssueMate ปลอม (ไม่เรียกของจริง ไม่รันสคริปต์จริง): node src/lib/auto-retest.check.mjs
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pollDeployed } from "./auto-retest.ts";

const dir = mkdtempSync(join(tmpdir(), "auto-retest-"));
const stateFile = join(dir, "auto-retest.json");
const tester = (code, sid, closedAt = "2026-10-29T10:00:00Z") => ({
  code, closedAt, status: "deployed", reporter: "UAT Tester Swarm [token ของ Tester]",
  description: `**ผลทดสอบ UAT อัตโนมัติไม่ผ่าน**\n\nสคริปต์: uat-scripts/${sid}.json — ทดสอบ\nเว็บที่ทดสอบ: https://uat.smlwork.com`,
});
let issues = [];
const calls = [];
const deps = {
  list: async () => issues,
  start: (ids, retestOf) => (calls.push([ids, retestOf]), ids[0] === "gone-script" ? { runs: [], unknown: ids } : { runs: [{ id: "R1" }], unknown: [] }),
  stateFile,
};
const poll = async () => { calls.length = 0; return pollDeployed(deps); };

try {
  // เปิดสวิตช์ครั้งแรก: ของที่ deployed อยู่ก่อนแล้วจดไว้เฉยๆ ไม่รันย้อนหลัง
  issues = [tester("SMLAIACC-1", "sales-old")];
  assert.deepEqual(await poll(), []);
  assert.equal(calls.length, 0);
  assert.ok(existsSync(stateFile));

  // ticket ของ Tester เพิ่ง deployed → startRuns 1 ครั้งพร้อม retestOf
  issues.push(tester("SMLAIACC-2", "sales-invoice-vat"));
  assert.deepEqual(await poll(), ["SMLAIACC-2"]);
  assert.deepEqual(calls, [[["sales-invoice-vat"], "SMLAIACC-2"]]);

  // สั่งไปแล้ว (รอบถัดไป / หลังรีสตาร์ทอ่านไฟล์เดิม) → ไม่เรียก
  assert.deepEqual(await poll(), []);
  assert.equal(calls.length, 0);

  // คนเปิด ticket เอง (อ้างสคริปต์ก็ตาม) / ไม่ได้อ้างสคริปต์ → ไม่เรียก
  issues.push({ ...tester("SMLAIACC-3", "sales-x"), reporter: "ลุงจืด [token ของคน]" });
  issues.push({ code: "SMLAIACC-4", reporter: "UAT Tester Swarm [token ของ Tester]", status: "deployed", description: "ไม่มีบรรทัดสคริปต์", closedAt: "2026-10-29T10:00:00Z" });
  assert.deepEqual(await poll(), []);
  assert.equal(calls.length, 0);

  // สถานะอื่น (เช่นเปิดกลับมาแก้ fixing) → ไม่เรียก
  issues.push({ ...tester("SMLAIACC-6", "sales-y"), status: "fixing" });
  assert.deepEqual(await poll(), []);
  assert.equal(calls.length, 0);
  issues.pop();

  // เปิดกลับมาแก้แล้ว deploy ใหม่ (closedAt เปลี่ยน) → ตรวจซ้ำอีกรอบ
  issues[1] = tester("SMLAIACC-2", "sales-invoice-vat", "2026-10-30T09:00:00Z");
  assert.deepEqual(await poll(), ["SMLAIACC-2"]);
  assert.deepEqual(calls, [[["sales-invoice-vat"], "SMLAIACC-2"]]);

  // สคริปต์ถูกลบแล้ว → ลองครั้งเดียว ไม่นับว่าสั่งแล้ว และไม่วนสั่งรอบหน้า
  const notes = [];
  deps.note = (text, code) => notes.push(code);
  issues.push(tester("SMLAIACC-5", "gone-script"));
  assert.deepEqual(await poll(), []);
  assert.equal(calls.length, 1);
  assert.deepEqual(notes, ["SMLAIACC-5"]);
  assert.deepEqual(await poll(), []);
  assert.equal(calls.length, 0);

  console.log("auto-retest: ผ่านทุกข้อ");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
