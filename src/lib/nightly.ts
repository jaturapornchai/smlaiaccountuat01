import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ScriptRun } from "@/types/bot";

// รอบ regression เต็มตอนกลางคืน — แกนตรรกะล้วน (ไม่ import โมดูลอื่นของแอป เพื่อให้ scripts/check-nightly.mjs รันตรวจด้วยเวลาปลอมได้)
// ต่อสายจริง (settings, startRuns, ตัวตั้งเวลา) อยู่ใน nightly-run.ts

export const NIGHT_FILE = join(process.cwd(), "runs", "nightly.json");
export const DEFAULT_TIME = "02:00";
export const GRACE_MIN = 180; // เลยเวลาไปเกินนี้แล้วไม่ตามไปรันให้ (กัน deploy ช่วงกลางวันแล้วเด้งรันเต็มชุด)
const KEEP_NIGHTS = 30;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (t: unknown): t is string => typeof t === "string" && TIME_RE.test(t);

// เวลาไทย = UTC+7 ตลอดปี (ไม่มี DST) บวกชดเชยตรงๆ พอ
const TZ_MS = 7 * 3_600_000;
export const thaiDate = (ms: number) => new Date(ms + TZ_MS).toISOString().slice(0, 10);
export const thaiHM = (ms: number) => new Date(ms + TZ_MS).toISOString().slice(11, 16);

export interface NightState {
  enabled: boolean;
  time: string; // HH:MM เวลาไทย
  // คืนที่สั่งรันแล้ว (คีย์ = วันที่ไทยของเวลาที่ตั้ง) — มีคีย์ = ห้ามสั่งซ้ำ แม้รีสตาร์ทกลางคืน
  history: Record<string, { startedAt: string; planned: string[] }>;
}

export function loadState(file = NIGHT_FILE): NightState {
  let j: Partial<NightState> = {};
  try {
    j = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    /* ยังไม่มีไฟล์ = ค่าเริ่มต้น (ปิดอยู่) */
  }
  return { enabled: j.enabled === true, time: isTime(j.time) ? j.time : DEFAULT_TIME, history: j.history && typeof j.history === "object" ? j.history : {} };
}

export function saveState(s: NightState, file = NIGHT_FILE) {
  const keep = Object.keys(s.history).sort().slice(-KEEP_NIGHTS);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...s, history: Object.fromEntries(keep.map((k) => [k, s.history[k]])) }, null, 1));
  renameSync(tmp, file); // เขียนแล้วสลับชื่อ — ล่มกลางทางไม่ได้ไฟล์ครึ่งๆ
}

// คืนที่ "ถึงเวลาสั่งรัน" ณ ตอนนี้: เวลาตั้งของวันนี้/เมื่อวาน (ข้ามเที่ยงคืนได้) ที่อยู่ในช่วงเวลาที่ยังตามรันได้ และยังไม่เคยสั่ง
export function dueNight(now: number, s: NightState, graceMin = GRACE_MIN): string | undefined {
  if (!s.enabled) return undefined;
  for (const d of [thaiDate(now), thaiDate(now - 86_400_000)]) {
    const at = Date.parse(`${d}T${s.time}:00+07:00`);
    if (now >= at && now < at + graceMin * 60_000 && !s.history[d]) return d;
  }
  return undefined;
}

export interface Env {
  now: () => number;
  config: () => { enabled: boolean; time: string }; // ค่าจาก settings (หน่วยความจำ)
  load: () => NightState;
  save: (s: NightState) => void;
  active: () => number; // รอบที่ยังเข้าคิว/กำลังรันทั้งหมด
  scriptIds: () => string[]; // ขอบเขตรอบคืน (สคริปต์คลังที่คนตรวจแล้ว ไม่รวม ask-*/auto-*)
  start: (ids: string[], night: string) => void;
  note: (text: string) => void;
}

const waited = new Set<string>();

// เรียกทุก ~30 วินาที · คืน "started" เมื่อสั่งรันรอบนี้, "waiting" เมื่อถึงเวลาแต่ยังมีรอบค้าง
export function tick(env: Env): "started" | "waiting" | "idle" {
  const st = env.load();
  const night = dueNight(env.now(), { ...st, ...env.config() });
  if (!night) return "idle";
  if (env.active()) {
    // ไม่สั่งซ้อนทับรอบที่ยังไม่จบ (รอบคืนก่อนหรือที่คนสั่งเอง) — ลองใหม่รอบถัดไปจนหมดช่วง GRACE_MIN
    if (!waited.has(night)) (waited.add(night), env.note(`รอบกลางคืน ${night}: ถึงเวลาแล้วแต่ยังมีรอบค้างอยู่ — รอให้จบก่อนแล้วค่อยเริ่ม`));
    return "waiting";
  }
  const ids = env.scriptIds();
  // จดก่อนสั่ง: ถ้าเซิร์ฟเวอร์ล่มระหว่างสั่ง รีสตาร์ทมาแล้วจะไม่สั่งซ้ำ (ข้ามคืนนั้นดีกว่ารันซ้ำสองรอบ)
  st.history[night] = { startedAt: new Date(env.now()).toISOString(), planned: ids };
  env.save(st);
  if (ids.length) env.start(ids, night);
  env.note(`รอบกลางคืน ${night}: สั่งรัน ${ids.length} สคริปต์ (ไม่รวม ask-*/auto-* ที่ AI เขียน)`);
  return "started";
}

// ---------- สรุปเช้า ----------
export type RunLite = Pick<ScriptRun, "id" | "scriptId" | "scriptTitle" | "severityOnFail" | "status" | "steps" | "message" | "issue" | "noIssue">;

export interface Failure {
  runId: string;
  scriptId: string;
  title: string;
  severity: string;
  status: "failed" | "error";
  reason: string;
  ticket?: string; // เลข issue ที่เปิดไว้ (หรือที่ต่อท้ายผลไว้)
  noIssue?: string; // เหตุผลที่ไม่เปิด issue
  since?: "new" | "same"; // เทียบคืนก่อน (ไม่มีคืนก่อนให้เทียบ = ไม่ระบุ)
}

export interface NightSummary {
  night: string;
  startedAt?: string;
  prevNight?: string;
  planned: number;
  passed: number;
  failed: number;
  error: number;
  pending: number; // ยังเข้าคิว/กำลังรัน
  skipped: number; // ตั้งใจรันแต่ไม่จบ: ผู้ใช้สั่งหยุด หรือตกคิวตอนเซิร์ฟเวอร์รีสตาร์ท
  failures: Failure[];
  fixed: { runId: string; scriptId: string; title: string }[]; // ล้มคืนก่อน คืนนี้ผ่าน
}

const bad = (r?: RunLite) => r?.status === "failed" || r?.status === "error";

function why(r: RunLite): string {
  const f = r.steps.find((s) => s.status === "failed" && !s.cleanup);
  const t = f ? `ขั้น ${f.i + 1} ${f.title}${f.detail ? ` — ${f.detail}` : ""}` : (r.message ?? "");
  return t.replace(/\s+/g, " ").slice(0, 160);
}

export function summarize(night: string, st: NightState, runs: RunLite[], prev?: { night: string; runs: RunLite[] }): NightSummary {
  const h = st.history[night];
  const count = (...s: string[]) => runs.filter((r) => s.includes(r.status)).length;
  const prevBy = new Map((prev?.runs ?? []).map((r) => [r.scriptId, r]));
  const sum: NightSummary = {
    night, startedAt: h?.startedAt, prevNight: prev?.night,
    planned: h?.planned.length ?? runs.length,
    passed: count("passed"), failed: count("failed"), error: count("error"), pending: count("queued", "running"), skipped: 0,
    failures: [], fixed: [],
  };
  sum.skipped = Math.max(0, sum.planned - sum.passed - sum.failed - sum.error - sum.pending);
  for (const r of runs) {
    const before = prevBy.get(r.scriptId);
    if (bad(r)) {
      sum.failures.push({
        runId: r.id, scriptId: r.scriptId, title: r.scriptTitle, severity: r.severityOnFail, status: r.status as "failed" | "error", reason: why(r),
        ticket: r.issue?.code, noIssue: r.noIssue, since: prev ? (bad(before) ? "same" : "new") : undefined,
      });
    } else if (r.status === "passed" && bad(before)) sum.fixed.push({ runId: r.id, scriptId: r.scriptId, title: r.scriptTitle });
  }
  // ร้ายแรงก่อน (S1→S4) แล้วล้มใหม่ก่อนล้มต่อเนื่อง
  sum.failures.sort((a, b) => a.severity.localeCompare(b.severity) || Number(b.since === "new") - Number(a.since === "new") || a.scriptId.localeCompare(b.scriptId));
  return sum;
}

const failLine = (f: Failure) => `- [${f.severity}] ${f.title} (${f.scriptId}) — ${f.reason || "ไม่มีรายละเอียด"} · ${f.ticket ? `ticket ${f.ticket}` : f.noIssue ? `ไม่เปิด ticket: ${f.noIssue}` : "ยังไม่มี ticket"}`;

// ข้อความไทยสำหรับ MCP tool "nightly"
export function nightLines(s: NightSummary): string[] {
  const head = [`ผ่าน ${s.passed}`, `ล้ม ${s.failed}`, s.error && `ผิดพลาด ${s.error}`, s.skipped && `ข้าม ${s.skipped} (หยุด/ตกคิวตอนรีสตาร์ท)`, s.pending && `กำลังรัน ${s.pending}`].filter(Boolean).join(" · ");
  const isNew = s.failures.filter((f) => f.since === "new");
  const same = s.failures.filter((f) => f.since === "same");
  const out = [`รอบกลางคืน ${s.night}${s.startedAt ? ` (เริ่ม ${thaiHM(Date.parse(s.startedAt))} น.)` : ""} · ทั้งหมด ${s.planned} สคริปต์ · ${head}`];
  if (!s.prevNight) out.push(...(s.failures.length ? ["ล้ม:", ...s.failures.map(failLine)] : []), "ยังไม่มีคืนก่อนให้เทียบ");
  else {
    out.push(`เทียบคืน ${s.prevNight}: ล้มใหม่ ${isNew.length} · หายแล้ว ${s.fixed.length} · ล้มต่อเนื่อง ${same.length}`);
    if (isNew.length) out.push("ล้มใหม่:", ...isNew.map(failLine));
    if (same.length) out.push("ล้มต่อเนื่อง:", ...same.map(failLine));
    if (s.fixed.length) out.push("หายแล้ว:", ...s.fixed.map((f) => `- ${f.title} (${f.scriptId})`));
  }
  return out;
}
