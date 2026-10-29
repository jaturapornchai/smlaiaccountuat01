import { readFileSync } from "node:fs";
import { ScriptRun, StepResult } from "@/types/bot";
import menuList from "./erp-menus.json";
import { listRuns } from "./uat-runs";
import { loadScripts } from "./uat-scripts";

// สรุปผลล่าสุดต่อเมนู/รายงาน/สคริปต์ตรวจ แล้วตัดสินว่าส่งมอบได้หรือไม่
// ponytail: erp-menus.json คัดจาก smlaiaccount frontend/src/config/smlMenu.json (เมนูปลายทางของ SMLAccount) — เมนูใน ERP เปลี่ยนให้สร้างใหม่ตาม README
export type ItemStatus = "passed" | "failed" | "untested";
export interface MenuResult { key: string; text: string; group: string; report: boolean; status: ItemStatus; reason?: string; severity?: string; runId?: string; at?: string }
export interface CheckResult { scriptId: string; title: string; module: string; lens: string; severity: string; ai: boolean; status: ItemStatus; reason?: string; runId?: string; at?: string }
export type Verdict = "ready" | "conditional" | "incomplete" | "blocked";
export interface Delivery { verdict: Verdict; reasons: string[]; menus: MenuResult[]; checks: CheckResult[]; generatedAt: string }

const isReport = (key: string, text: string) => /รายงาน/.test(text) || /report/.test(key);
const why = (s: StepResult) => [s.title, s.detail, s.expected !== undefined || s.actual !== undefined ? `คาดหวัง ${s.expected ?? "-"} / ค่าจริง ${s.actual ?? "-"}` : ""].filter(Boolean).join(" · ");
const blocking = (sev?: string) => sev === "S1" || sev === "S2";

// รอบล่าสุดที่รันจบแล้วของแต่ละสคริปต์
function latestRuns(): Map<string, ScriptRun> {
  const out = new Map<string, ScriptRun>();
  for (const r of listRuns(Infinity)) if (r.finishedAt && !out.has(r.scriptId)) out.set(r.scriptId, r);
  return out;
}

// ผลต่อเมนู: ช่วงตั้งแต่ ui.openMenu ถึงก่อน openMenu ถัดไป มีขั้นไม่ผ่าน = เมนูนั้นไม่ผ่าน
function menuResults(run: ScriptRun, stepsOfScript: { key?: string }[]): MenuResult[] {
  const out: MenuResult[] = [];
  let cur: MenuResult | undefined;
  for (const s of run.steps.filter((x) => !x.cleanup)) {
    if (s.kind === "ui.openMenu") {
      const key = s.detail?.match(/menu_[a-z0-9_]+/)?.[0] ?? stepsOfScript[s.i]?.key;
      cur = key && (s.status === "passed" || s.status === "failed") ? { key, text: "", group: "", report: false, status: "passed", severity: run.severityOnFail, runId: run.id, at: run.finishedAt } : undefined;
      if (cur) out.push(cur);
    }
    if (cur && s.status === "failed" && cur.status === "passed") Object.assign(cur, { status: "failed", reason: why(s) });
  }
  return out;
}

export function buildDelivery(): Delivery {
  const scripts = loadScripts().scripts;
  const latest = latestRuns();
  const byKey = new Map<string, MenuResult>(menuList.map(([key, text, group]) => [key, { key, text, group, report: isReport(key, text), status: "untested" as ItemStatus }]));

  const checks: CheckResult[] = scripts.map((sc) => {
    const run = latest.get(sc.id);
    const base = { scriptId: sc.id, title: sc.title, module: sc.module, lens: sc.lens, severity: sc.severityOnFail, ai: sc.id.startsWith("ask-") };
    if (!run) return { ...base, status: "untested" };
    const steps = (JSON.parse(readFileSync(sc.file, "utf8")).steps ?? []) as { key?: string }[];
    for (const m of menuResults(run, steps)) {
      const had = byKey.get(m.key);
      if (had && had.at && had.at > m.at!) continue; // เมนูเดียวกันหลายสคริปต์ ใช้ผลที่ใหม่สุด
      byKey.set(m.key, { ...m, text: had?.text ?? m.key, group: had?.group ?? "อื่นๆ (ไม่อยู่ในทะเบียนเมนู)", report: had?.report ?? isReport(m.key, "") });
    }
    const failed = run.steps.filter((s) => s.status === "failed");
    const reason = run.status === "passed" ? undefined : failed.map(why).join("\n") || run.message || `สถานะ ${run.status}`;
    return { ...base, status: run.status === "passed" ? "passed" : "failed", reason, runId: run.id, at: run.finishedAt };
  });

  const menus = [...byKey.values()];
  const failedAll = [...menus, ...checks].filter((x) => x.status === "failed");
  const severe = failedAll.filter((x) => blocking(x.severity));
  const count = (xs: { status: ItemStatus }[]) => `${xs.filter((x) => x.status !== "untested").length}/${xs.length}`;
  const pct = (xs: { status: ItemStatus }[]) => Math.round((xs.filter((x) => x.status !== "untested").length / Math.max(xs.length, 1)) * 100);
  const plain = menus.filter((m) => !m.report);
  const reports = menus.filter((m) => m.report);
  const untested = menus.filter((m) => m.status === "untested").length + checks.filter((c) => c.status === "untested").length;

  const verdict: Verdict = severe.length ? "blocked" : untested ? "incomplete" : failedAll.length ? "conditional" : "ready";
  const reasons = [
    severe.length ? `มีจุดไม่ผ่านระดับร้ายแรง (S1/S2) ${severe.length} รายการ: ${severe.slice(0, 5).map((x) => ("text" in x ? x.text : x.title)).join(", ")}${severe.length > 5 ? " …" : ""}` : "ไม่มีจุดไม่ผ่านระดับร้ายแรง (S1/S2)",
    `เมนูทดสอบแล้ว ${count(plain)} (${pct(plain)}%) · รายงานทดสอบแล้ว ${count(reports)} (${pct(reports)}%) · สคริปต์ตรวจรันแล้ว ${count(checks)}`,
    failedAll.length - severe.length ? `ไม่ผ่านระดับรอง (S3/S4) ${failedAll.length - severe.length} รายการ` : "",
    untested ? `ยังไม่ได้ทดสอบ ${untested} รายการ — รับรองว่าใช้งานได้ไม่ได้จนกว่าจะทดสอบ` : "",
    checks.some((c) => c.ai && c.status === "failed") ? "บางรายการมาจากสคริปต์ที่ AI เขียนจากคำสั่ง (ask-*) ต้องให้คนยืนยันก่อนสรุปว่าเป็นบั๊ก" : "",
  ].filter(Boolean);

  return { verdict, reasons, menus, checks, generatedAt: new Date().toISOString() };
}
