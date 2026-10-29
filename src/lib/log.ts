import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// บันทึกการทำงานถาวร (ไม่หายตอนรีสตาร์ท): runs/logs/YYYY-MM-DD.jsonl บรรทัดละ 1 เหตุการณ์ (วันที่ตามเวลาไทย)
// ไว้ตรวจย้อนหลังว่าระบบทำอะไร ช้า/พังตรงไหน แล้วเอาไปปรับปรุง · อ่านผ่าน GET /api/logs หรือ MCP tool "logs"
// ponytail: ไฟล์ในเครื่องพอสำหรับเซิร์ฟเวอร์เดียว — ย้ายไป MongoDB เมื่อต้องค้นข้ามเครื่องหรือเก็บเกิน KEEP_DAYS
export const LOG_DIR = join(process.cwd(), "runs", "logs");
const KEEP_DAYS = 30;

export type LogKind = "server" | "activity" | "brain" | "web" | "mcp" | "api";
export interface LogEntry {
  at: string;
  kind: LogKind;
  ok?: boolean;
  ms?: number;
  error?: string;
  [k: string]: unknown;
}

// ปิดความลับทุกค่าที่มาจาก env ชื่อ PASS/TOKEN/SECRET/KEY ก่อนลงไฟล์ (ใช้ร่วมกับ uat-runs)
const SECRETS = Object.entries(process.env).filter(([k, v]) => /PASS|TOKEN|SECRET|KEY/i.test(k) && v && v.length >= 4).map(([, v]) => v as string);
export const redact = (s: string) => SECRETS.reduce((t, v) => t.split(v).join("***REDACTED***"), s);

const thaiDay = (t = Date.now()) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
let prunedOn = "";

function prune(today: string) {
  const cut = thaiDay(Date.parse(today) - KEEP_DAYS * 86_400_000);
  for (const f of readdirSync(LOG_DIR)) if (f.endsWith(".jsonl") && f.slice(0, 10) < cut) unlinkSync(join(LOG_DIR, f));
}

export function writeLog(kind: LogKind, data: Record<string, unknown>) {
  try {
    const day = thaiDay();
    mkdirSync(LOG_DIR, { recursive: true });
    if (prunedOn !== day) (prunedOn = day), prune(day);
    const line = JSON.stringify({ at: new Date().toISOString(), kind, ...data }, (_, v) => (typeof v === "string" ? redact(v) : v));
    appendFileSync(join(LOG_DIR, `${day}.jsonl`), line + "\n");
  } catch {
    /* log พังต้องไม่ทำให้งานหลักพัง */
  }
}

// จับเวลา + ผลสำเร็จ/ล้มของงานหนึ่งชิ้นแล้วลง log (error ยังโยนต่อให้ผู้เรียกจัดการเหมือนเดิม)
export async function timed<T>(kind: LogKind, data: Record<string, unknown>, fn: () => Promise<T>, after?: (r: T) => Record<string, unknown>): Promise<T> {
  const t = Date.now();
  try {
    const r = await fn();
    writeLog(kind, { ...data, ok: true, ms: Date.now() - t, ...after?.(r) });
    return r;
  } catch (e) {
    writeLog(kind, { ...data, ok: false, ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

export const logDays = () => (existsSync(LOG_DIR) ? readdirSync(LOG_DIR).filter((f) => f.endsWith(".jsonl")).map((f) => f.slice(0, 10)).sort().reverse() : []);

export interface LogQuery {
  date?: string; // YYYY-MM-DD เวลาไทย, ว่าง = วันนี้
  kind?: string;
  q?: string; // คำค้นในบรรทัด
  errors?: boolean; // เฉพาะที่ ok = false
  limit?: number;
}

export function readLogs({ date, kind, q, errors, limit = 100 }: LogQuery) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date! : thaiDay();
  const file = join(LOG_DIR, `${day}.jsonl`);
  const all: LogEntry[] = existsSync(file)
    ? readFileSync(file, "utf8").split("\n").flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
    : [];
  const hit = all.filter((e) => (!kind || e.kind === kind) && (!errors || e.ok === false) && (!q || JSON.stringify(e).includes(q)));
  return { day, total: all.length, matched: hit.length, entries: hit.slice(-Math.min(Math.max(limit, 1), 500)), summary: summarize(all) };
}

// สรุปต่อชนิด: จำนวน ล้ม เวลาเฉลี่ย/สูงสุด + error ที่เจอบ่อย + งานที่ช้าที่สุด — ใช้ชี้จุดที่ควรปรับปรุง
function summarize(all: LogEntry[]) {
  const byKind: Record<string, { count: number; failed: number; avgMs?: number; maxMs?: number }> = {};
  const ms: Record<string, number[]> = {};
  const errs = new Map<string, number>();
  for (const e of all) {
    const k = (byKind[e.kind] ??= { count: 0, failed: 0 });
    k.count++;
    if (e.ok === false) {
      k.failed++;
      const m = `${e.kind}: ${String(e.error ?? "").slice(0, 120)}`;
      errs.set(m, (errs.get(m) ?? 0) + 1);
    }
    if (typeof e.ms === "number") (ms[e.kind] ??= []).push(e.ms);
  }
  for (const [k, v] of Object.entries(ms)) Object.assign(byKind[k], { avgMs: Math.round(v.reduce((a, b) => a + b, 0) / v.length), maxMs: Math.max(...v) });
  const topErrors = [...errs].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([error, count]) => ({ error, count }));
  const slowest = all.filter((e) => typeof e.ms === "number" && e.kind !== "mcp").sort((a, b) => b.ms! - a.ms!).slice(0, 5)
    .map((e) => ({ at: e.at, kind: e.kind, ms: e.ms, what: String(e.tool ?? e.model ?? e.query ?? e.type ?? "") }));
  return { byKind, topErrors, slowest };
}
