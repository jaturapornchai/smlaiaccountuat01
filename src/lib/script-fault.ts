import { ScriptRun, StepResult } from "@/types/bot";
import menuList from "./erp-menus.json";

// ความผิดของตัวสคริปต์ ไม่บอกอะไรเรื่อง ERP → ไม่เปิด issue
// แบบข้อความมาจาก runner/run.mjs และคัดจาก run.json ของ ticket ที่ปิด wont_fix "สคริปต์ผิดเอง" (SMLAIACC-172..231, 2026-10-29)
const OWN_ERROR = /^(psql ผิดพลาด|ไม่มีตัวแปร \{\{)|^AI ทำไม่จบใน \d+ ตา/;
const PREP = new Set(["set", "ui.demoLogin", "ui.expectClean", "db.query"]); // ขั้นที่ยังไม่ได้แตะหน้าจอ/API ของ ERP
const MENUS = new Set(menuList.map(([key]) => key));

function ownFault(s: StepResult, steps: StepResult[]) {
  const d = s.detail ?? "";
  if (OWN_ERROR.test(d)) return true;
  // ขั้นเตรียมข้อมูลหาแถวตั้งต้นไม่เจอ (เงื่อนไขแคบ/ใช้ข้อมูลที่สคริปต์ไม่ได้สร้าง) ก่อนแตะ ERP — 186 193 205 207 213 215 216 227
  if (s.kind === "db.query" && s.actual === "0" && steps.every((p) => p.i >= s.i || PREP.has(p.kind))) return true;
  // path/body ผิด: 404 ได้หน้า HTML (ไม่มี route), 405, 400 "กรุณาระบุ…" — 179 228 231
  if (s.kind === "api.request" && /^(404 <!DOCTYPE|405\b|400 .*กรุณาระบุ)/i.test(s.actual ?? "")) return true;
  // เปิดเมนูที่ไม่มีใน ERP (รวม undefined) — 211 229
  const menu = s.kind === "ui.openMenu" ? /^เมนู (\S+) ไม่เปิด/.exec(d)?.[1] : undefined;
  return !!menu && !MENUS.has(menu);
}

// คืนขั้นแรกที่พัง เมื่อทุกขั้นที่พัง (ไม่นับเก็บกวาด) เป็นความผิดของสคริปต์ทั้งหมด
export function scriptFault(run: ScriptRun) {
  const failed = run.steps.filter((s) => s.status === "failed" && !s.cleanup);
  return failed.length > 0 && failed.every((s) => ownFault(s, run.steps)) ? failed[0] : undefined;
}

