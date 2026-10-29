import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ScriptRun, StepResult } from "@/types/bot";
import { askBrain } from "./brain";
import menuList from "./erp-menus.json";
import { smlContext } from "./sml-mcp";
import { SCRIPT_DIR } from "./uat-scripts";

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

// ---------- ด่านคัดสคริปต์ AI (ask-*, MCP save_script) ก่อนเปิด issue ----------
// selector ผิด/ป๊อปอัปบัง/คาดค่าผิดจากที่ออกแบบ แยกด้วย regex ไม่ได้ (wont_fix 2026-10-29 กลุ่ม A/D 22 เรื่อง) → ให้สมอง AI ดูหลักฐานแบบ UAT Lead
// ponytail: Tester ไม่มีโค้ด SML ให้อ่าน — ใช้การออกแบบที่ UAT Lead ยืนยันจากโค้ดตอนปิด ticket แทน; เจอแบบใหม่ที่ปิด wont_fix ให้เพิ่มบรรทัดที่นี่
// การออกแบบของ SML ที่ยืนยันจากโค้ดแล้ว (ไม่ใช่บั๊ก) — ใช้ทั้งด่านคัดและตอน AI ซ่อมสคริปต์ (command.ts healScript)
export const DESIGN = `- ช่องตัวเลขแสดงศูนย์เป็นช่องว่าง
- ช่องในตารางกรอก (grid) เป็น input ต้องอ่านค่า value ไม่ใช่ innerText
- ข้อความในตารางรายการ (datalist) อยู่ใน td > div > span
- ปุ่ม toolbar ของจออยู่ใน div ใต้ header ไม่ได้อยู่ใน header
- ตัวเลือกน้อยกว่า 10 ตัวแสดงเป็น radio แทน select
- ปุ่มที่เมาส์ค้างอยู่ถูกเอา title ออกระหว่างแสดงบอลลูนช่วยเหลือ และป๊อปอัปคำอธิบายช่องบังปุ่มได้
- หน้าต่างค้นหาตัดคำค้นเป็นหลายคำ แล้วถอยไปค้นแบบใกล้เคียงเมื่อไม่พบตรงๆ
- เอกสารขายตั้งราคาตอนใส่จำนวน ไม่ใช่ตอนใส่รหัสสินค้า
- รายงานใบขอซื้อแสดงยอดก่อน VAT
- ราคาต่อหน่วยเก็บละเอียดกว่าที่แสดง → sum_amount อาจไม่เท่าจำนวน × ราคาที่ปัด 2 ตำแหน่ง
- สินทรัพย์ที่ยังไม่ขาย: as_sale_price = 0 และ as_sale_to/doc_sale_ref เป็นค่าว่าง ไม่ใช่ NULL
- gl_chart_of_account.tax_type 1 = ภาษีขาย, 2 = ภาษีซื้อ`;
const TRIAGE = `คุณตรวจรอบทดสอบ UAT ที่ไม่ผ่านของระบบบัญชี SML AI Account ก่อนเปิด ticket ให้ทีมแก้ระบบ
สคริปต์นี้ AI เขียน มักผิดเอง: selector/คำค้นไม่ตรงจอจริง, ป๊อปอัปบังปุ่ม, อ่านค่าจาก element ผิดชนิด, คาดค่าผิดจากที่ระบบออกแบบไว้, สูตร SQL ฝั่งทดสอบผิด
ตอบ SCRIPT_FAULT เฉพาะเมื่อหลักฐาน (ขั้นที่พัง ค่าคาดหวัง/ค่าจริง ภาพหน้าจอ และการออกแบบด้านล่าง) ชี้ชัดว่าสคริปต์ผิด
ถ้าระบบอาจผิดจริงหรือไม่แน่ใจ ตอบ ERP_BUG หรือ UNSURE — บั๊กจริงที่หลุดไปแย่กว่า ticket ขยะ
การออกแบบของ SML ที่ยืนยันจากโค้ดแล้ว (ไม่ใช่บั๊ก):
${DESIGN}
ตอบ JSON เท่านั้น: verdict, reason (ภาษาไทย 1 บรรทัด) และ evidence = ข้อความที่คัดลอกตรงตัวจากหลักฐานด้านบนหรือการออกแบบ ที่ใช้ตัดสิน (ระบบตรวจว่ามีจริง ไม่มี = ไม่นับว่าสคริปต์ผิด)`;
const TRIAGE_SCHEMA = { type: "object", properties: { verdict: { type: "string", enum: ["SCRIPT_FAULT", "ERP_BUG", "UNSURE"] }, reason: { type: "string" }, evidence: { type: "string" } }, required: ["verdict", "reason", "evidence"] };
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

// คืนเหตุผลเมื่อ AI ชี้ชัดว่าสคริปต์ผิดเอง · ERP_BUG/UNSURE/สมองล่ม → undefined = เปิด issue ตามเดิม
export async function aiTriage(run: ScriptRun, outDir: string, model: string): Promise<string | undefined> {
  const failed = run.steps.filter((s) => s.status === "failed" && !s.cleanup);
  if (!failed.length) return undefined;
  try {
    const script = JSON.parse(readFileSync(join(SCRIPT_DIR, `${run.scriptId}.json`), "utf8"));
    const facts = [
      `สคริปต์ ${run.scriptId}: ${run.scriptTitle}${script.description ? ` — ${script.description}` : ""}`,
      `ผ่าน ${run.passed} ขั้น ไม่ผ่าน ${run.failed} ขั้น`,
      ...failed.flatMap((s) => [
        `ขั้น ${s.i + 1} ${s.title} [${s.kind}] — ${s.detail ?? ""}`,
        ...(s.expected !== undefined ? [`  คาดหวัง: ${s.expected}`] : []),
        ...(s.actual !== undefined ? [`  ค่าจริง: ${s.actual}`] : []),
        ...(s.query ? [`  คำสั่งที่รัน: ${s.query}`] : []),
        `  นิยามขั้นในสคริปต์: ${JSON.stringify(script.steps?.[s.i] ?? {}).slice(0, 1500)}`,
      ]),
    ].join("\n");
    const shot = failed.find((s) => s.evidence?.endsWith(".png"))?.evidence;
    const png = shot && existsSync(join(outDir, shot)) ? [readFileSync(join(outDir, shot)).toString("base64")] : [];
    const sml = await smlContext(`คัดรอบทดสอบที่พัง: สคริปต์ "${run.scriptTitle}" ผิดเองหรือระบบ SML ผิดจริง — ${failed.map((s) => `${s.title}: ${s.detail ?? ""}`).join(" · ")}`.slice(0, 1500));
    const prompt = `${facts.slice(0, 12_000)}${sml ? `\n\n${sml}` : ""}`;
    const text = await askBrain("triage", model, TRIAGE, prompt, png, TRIAGE_SCHEMA);
    const r = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); // โมเดลชอบห่อด้วย ```json
    // กฎกลางข้อ 1: ชี้ว่าสคริปต์ผิดได้เฉพาะเมื่อคัดหลักฐานที่มีจริงมา — แต่งเหตุผลเอง = เปิด issue ตามเดิม (บั๊กจริงไม่หลุด)
    const quote = flat(String(r.evidence ?? ""));
    if (quote.length < 8 || !flat(`${DESIGN}\n${prompt}`).includes(quote)) return undefined;
    return r.verdict === "SCRIPT_FAULT" && r.reason ? `${String(r.reason).slice(0, 300)} (หลักฐาน: ${quote.slice(0, 200)})` : undefined;
  } catch {
    return undefined;
  }
}
