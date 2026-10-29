import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ScriptRun } from "@/types/bot";

// ประวัติรอบทดสอบถาวร: 1 บรรทัดต่อรอบที่จบ ใน data/run-history/YYYY-MM.jsonl (เดือนตาม UTC ของ finishedAt)
// อยู่นอก runs/ เพราะ runs/<id>/ เป็นหลักฐานรายรอบที่ถูกจัดการแยก ส่วนไฟล์นี้ต้องอยู่ยาวไว้ดูแนวโน้ม (deploy ห้ามทับ ./data)
// append-only: รอบเดียวมีได้หลายบรรทัด (จบแล้ว + ได้ ticket ทีหลัง) ตอนอ่านเอาบรรทัดท้ายสุดของ id นั้น
// ไฟล์ต้องไม่ import อะไรนอกจาก node: เพื่อให้ scripts/check-run-history.mjs รันตรงด้วย node ได้
export const HISTORY_DIR = join(process.cwd(), "data", "run-history");
const RUN_DIR = join(process.cwd(), "runs");
export const MAX_DAYS = 90; // เพดานช่วงที่ขอได้ต่อคำขอ → อ่านไม่เกิน ~4 ไฟล์รายเดือน
const TZ_MS = 7 * 3600_000; // วันตามเวลาไทย เหมือน log.ts

export interface HistoryRow {
  id: string;
  scriptId: string;
  module: string;
  lens: string;
  bot: string;
  status: string;
  passed: number;
  failed: number;
  durationMs?: number; // ผลรวม durationMs ของทุกขั้น (ไม่รวมเวลารอคิว/เปิดเบราว์เซอร์)
  startedAt?: string;
  finishedAt: string;
  ticket?: string;
  retestOf?: string;
}

// ---------- เขียน ----------

export function toRow(r: ScriptRun): HistoryRow | null {
  if (!r.finishedAt) return null;
  const ms = r.steps.reduce((t, s) => t + (s.durationMs ?? 0), 0);
  return { id: r.id, scriptId: r.scriptId, module: r.module, lens: r.lens, bot: r.botId, status: r.status, passed: r.passed, failed: r.failed, durationMs: ms || undefined, startedAt: r.startedAt, finishedAt: r.finishedAt, ticket: r.issue?.code, retestOf: r.retestOf };
}

const monthOf = (iso: string) => iso.slice(0, 7);
const fileOf = (dir: string, month: string) => join(dir, `${month}.jsonl`);

function appendRow(row: HistoryRow, dir: string) {
  mkdirSync(dir, { recursive: true });
  appendFileSync(fileOf(dir, monthOf(row.finishedAt)), JSON.stringify(row) + "\n");
}

const lastTicket = new Map<string, string>(); // id → ticket ที่จดล่าสุด กันจดซ้ำเมื่อ save() ถูกเรียกหลายครั้งโดยไม่มีอะไรเปลี่ยน

// เรียกจาก save() ของ uat-runs ทุกครั้ง · รอบที่ยังไม่จบข้าม · ticket โผล่ทีหลังตอน sendToIssueMate จึงจดอีกบรรทัด
export function recordRun(run: ScriptRun, dir = HISTORY_DIR) {
  const row = toRow(run);
  if (!row || lastTicket.get(row.id) === (row.ticket ?? "")) return;
  try {
    appendRow(row, dir);
    lastTicket.set(row.id, row.ticket ?? "");
  } catch (e) {
    console.error("[run-history] จดประวัติรอบ", row.id, "ไม่สำเร็จ:", e); // ประวัติพังต้องไม่ทำให้รอบทดสอบพัง
  }
}

// ตอนเริ่มเซิร์ฟเวอร์: เติมรอบเก่าที่มี runs/*/run.json แต่ยังไม่อยู่ในประวัติ (id เดียวกันไม่เติมซ้ำ) → คืนจำนวนที่เติม
export function backfillHistory(runDir = RUN_DIR, dir = HISTORY_DIR): number {
  if (!existsSync(runDir)) return 0;
  const todo: HistoryRow[] = [];
  for (const d of readdirSync(runDir)) {
    try {
      const row = toRow(JSON.parse(readFileSync(join(runDir, d, "run.json"), "utf8")));
      if (row) todo.push(row);
    } catch {
      /* ไม่ใช่โฟลเดอร์รอบ (logs, ไฟล์ token) หรือรอบที่ยังไม่มี run.json */
    }
  }
  const known = new Map<string, Set<string>>(); // เดือน → id ที่อยู่ในไฟล์แล้ว (อ่านเฉพาะเดือนที่มีรอบรอเติม)
  let added = 0;
  for (const row of todo.sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))) {
    const m = monthOf(row.finishedAt);
    if (!known.has(m)) known.set(m, new Set(readMonth(dir, m).map((r) => r.id)));
    if (known.get(m)!.has(row.id)) continue;
    appendRow(row, dir);
    known.get(m)!.add(row.id);
    added++;
  }
  return added;
}

// ---------- อ่าน (มีขอบเขต) ----------

function readMonth(dir: string, month: string): HistoryRow[] {
  const f = fileOf(dir, month);
  if (!existsSync(f)) return [];
  const out: HistoryRow[] = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* บรรทัดที่เขียนไม่จบ (ปิดเซิร์ฟเวอร์กลางเขียน) ข้าม */
    }
  }
  return out;
}

// อ่านเฉพาะไฟล์เดือนที่คาบเกี่ยวช่วง [fromMs, toMs] แล้วกรองตาม finishedAt — ไม่แตะเดือนอื่นเลย
// ponytail: ไฟล์เดือนหนึ่งอ่านทั้งไฟล์ (~250 ไบต์/รอบ → 1 MB ≈ 4,000 รอบ/เดือน) ถ้าเดือนหนึ่งเกินหลายหมื่นรอบ ให้เปลี่ยนเป็นไฟล์รายวัน (แบบ log.ts) หรือเก็บสรุปรายวันแยก
export function readRows(fromMs: number, toMs: number, dir = HISTORY_DIR): HistoryRow[] {
  const last = monthOf(new Date(toMs).toISOString());
  const rows: HistoryRow[] = [];
  for (let d = new Date(fromMs); monthOf(d.toISOString()) <= last; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) rows.push(...readMonth(dir, monthOf(d.toISOString())));
  const byId = new Map(rows.map((r) => [r.id, r])); // บรรทัดท้ายสุดของ id ชนะ
  return [...byId.values()].filter((r) => Date.parse(r.finishedAt) >= fromMs && Date.parse(r.finishedAt) <= toMs).sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
}

// ---------- วิเคราะห์ (ฟังก์ชันล้วน รับ rows เรียงเวลาเก่า→ใหม่) ----------

// กติกาจับความผิดปกติ — ส่งไปกับ API ให้หน้าเว็บอธิบายกติกาได้ตรงกับที่ใช้จริง
export const RULES = {
  slowRecent: 3, // เทียบ "ค่ากลางของ 3 รอบล่าสุด" …
  slowBaseMin: 5, // … กับค่ากลางของรอบก่อนหน้า (ต้องมีอย่างน้อย 5 รอบ ไม่งั้นยังไม่ตัดสิน)
  slowBaseMax: 20,
  slowRatio: 1.5, // ช้ากว่าปกติอย่างน้อย 1.5 เท่า
  slowMinExtraMs: 3000, // และช้าเกิน 3 วิ (สคริปต์สั้นๆ แกว่งเป็นเรื่องปกติ)
  flakyMinRuns: 4,
  flakyMinFlips: 2, // สลับผ่าน↔ไม่ผ่านอย่างน้อย 2 ครั้ง
  flakyFlipRate: 0.3, // และสลับอย่างน้อย 30% ของจังหวะระหว่างรอบ (พัง 3 รอบแล้วแก้ผ่าน = สลับแค่ 2 ครั้งใน 10 รอบ ไม่นับว่าไม่นิ่ง)
};

export const dayOf = (iso: string | number) => new Date((typeof iso === "number" ? iso : Date.parse(iso)) + TZ_MS).toISOString().slice(0, 10);
const decided = (r: HistoryRow) => r.status === "passed" || r.status === "failed"; // error/stopped ไม่ใช่หลักฐานว่า ERP ผ่านหรือพัง
const rate = (p: number, f: number) => (p + f ? p / (p + f) : null);

export interface DayStat { day: string; passed: number; failed: number; rate: number | null }
export interface ModuleTrend { module: string; days: DayStat[]; passed: number; failed: number; rate: number | null }

// อัตราผ่านต่อโมดูลต่อวัน (วันตามเวลาไทย) นับเป็นจำนวนรอบ ไม่ใช่จำนวนขั้น
export function passRateByModuleDay(rows: HistoryRow[]): ModuleTrend[] {
  const mods = new Map<string, Map<string, { p: number; f: number }>>();
  for (const r of rows.filter(decided)) {
    if (!mods.has(r.module)) mods.set(r.module, new Map());
    const days = mods.get(r.module)!;
    const day = dayOf(r.finishedAt);
    const c = days.get(day) ?? { p: 0, f: 0 };
    if (r.status === "passed") c.p++;
    else c.f++;
    days.set(day, c);
  }
  return [...mods].map(([module, days]) => {
    const list = [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, c]) => ({ day, passed: c.p, failed: c.f, rate: rate(c.p, c.f) }));
    const passed = list.reduce((t, d) => t + d.passed, 0);
    const failed = list.reduce((t, d) => t + d.failed, 0);
    return { module, days: list, passed, failed, rate: rate(passed, failed) };
  });
}

const byScript = (rows: HistoryRow[]) => {
  const m = new Map<string, HistoryRow[]>();
  for (const r of rows) (m.get(r.scriptId) ?? m.set(r.scriptId, []).get(r.scriptId)!).push(r);
  return m;
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

export interface SlowScript { scriptId: string; recentMs: number; baseMs: number; ratio: number; runId: string; baseRuns: number }

// สคริปต์ที่ "ผ่าน" แล้วช้าลง: ค่ากลางของรอบล่าสุดเทียบค่ากลางย้อนหลัง (รอบที่ไม่ผ่านจบก่อนเวลาเพราะขั้นหลังถูกข้าม จึงไม่เอามาเทียบ)
export function findSlow(rows: HistoryRow[], k = RULES): SlowScript[] {
  const out: SlowScript[] = [];
  for (const [scriptId, rs] of byScript(rows.filter((r) => r.status === "passed" && r.durationMs))) {
    if (rs.length < k.slowRecent + k.slowBaseMin) continue;
    const recent = rs.slice(-k.slowRecent);
    const base = rs.slice(-k.slowRecent - k.slowBaseMax, -k.slowRecent);
    const recentMs = median(recent.map((r) => r.durationMs!));
    const baseMs = median(base.map((r) => r.durationMs!));
    if (recentMs >= baseMs * k.slowRatio && recentMs - baseMs >= k.slowMinExtraMs) out.push({ scriptId, recentMs, baseMs, ratio: recentMs / baseMs, runId: recent[recent.length - 1].id, baseRuns: base.length });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

export interface FlakyScript { scriptId: string; runs: number; flips: number; passed: number; failed: number; last: { id: string; ok: boolean }[] }

// สคริปต์ผลไม่นิ่ง: ผ่านสลับไม่ผ่านบ่อย · รอบตรวจซ้ำหลังแก้ (retestOf) ไม่นับ เพราะไม่ผ่าน→ผ่านเป็นผลของการแก้ ไม่ใช่ความไม่นิ่ง
export function findFlaky(rows: HistoryRow[], k = RULES): FlakyScript[] {
  const out: FlakyScript[] = [];
  for (const [scriptId, rs] of byScript(rows.filter((r) => decided(r) && !r.retestOf))) {
    if (rs.length < k.flakyMinRuns) continue;
    const flips = rs.filter((r, i) => i && r.status !== rs[i - 1].status).length;
    if (flips < k.flakyMinFlips || flips / (rs.length - 1) < k.flakyFlipRate) continue;
    const passed = rs.filter((r) => r.status === "passed").length;
    out.push({ scriptId, runs: rs.length, flips, passed, failed: rs.length - passed, last: rs.slice(-12).map((r) => ({ id: r.id, ok: r.status === "passed" })) });
  }
  return out.sort((a, b) => b.flips / b.runs - a.flips / a.runs);
}

export interface Trend { from: string; to: string; days: string[]; totalRuns: number; modules: ModuleTrend[]; slow: SlowScript[]; flaky: FlakyScript[] }

export function buildTrend(rows: HistoryRow[], fromMs: number, toMs: number): Trend {
  const days: string[] = [];
  for (let t = Date.parse(dayOf(fromMs) + "T00:00:00Z"); t <= Date.parse(dayOf(toMs) + "T00:00:00Z"); t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), days, totalRuns: rows.length, modules: passRateByModuleDay(rows), slow: findSlow(rows), flaky: findFlaky(rows) };
}

// ช่วง `days` วันนับถึงวันนี้ (เวลาไทย) → อ่านไฟล์ + สรุป · days เกิน MAX_DAYS ถูกตัด
export function loadTrend(days: number, now = Date.now(), dir = HISTORY_DIR): Trend {
  const n = Math.min(MAX_DAYS, Math.max(1, Math.floor(days) || 30));
  const fromMs = Date.parse(dayOf(now) + "T00:00:00Z") - TZ_MS - (n - 1) * 86_400_000; // 00:00 เวลาไทยของวันแรก
  return buildTrend(readRows(fromMs, now, dir), fromMs, now);
}
