import { ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BotConfig, BotTask, IssueLink, ScriptRun, StepResult } from "@/types/bot";
import { pushActivity } from "./activity";
import { redact } from "./log";
import { clearSent, commentIssue, reportRun } from "./issuemate";
import { aiTriage, scriptFault } from "./script-fault";
import { recordRun } from "./run-history";
import { addEvent, getBotById, getBots, getSettings } from "./swarm-store";
import { loadScripts, retireScript } from "./uat-scripts";

export const RUN_DIR = join(process.cwd(), "runs");
const RUNNER = join(process.cwd(), "runner", "run.mjs");
const KEEP_RUNS = 60;

// ชั้นที่ 2 ของการปิดความลับ (ตัวรันปิดแล้วชั้นแรก): ทุกบรรทัดจากตัวรันผ่าน redact ก่อนเข้า run.json / หน้าเว็บ / IssueMate

// state อยู่บน global เพื่อให้รอดตอน dev reload; ผลที่จบแล้วเก็บถาวรที่ runs/<id>/run.json
declare global {
  // eslint-disable-next-line no-var
  var __uat_runs: Map<string, ScriptRun> | undefined;
  // eslint-disable-next-line no-var
  var __uat_queue: string[] | undefined;
  // eslint-disable-next-line no-var
  var __uat_procs: Map<string, ChildProcess> | undefined;
  // eslint-disable-next-line no-var
  var __uat_batch: { p: number; f: number; e: number; ids?: string[] } | undefined;
}
const runs = (global.__uat_runs ??= new Map());
const queue = (global.__uat_queue ??= []);
const procs = (global.__uat_procs ??= new Map());
const batch = (global.__uat_batch ??= { p: 0, f: 0, e: 0 }); // นับผลของชุดที่รันต่อเนื่องจนคิวว่าง

if (runs.size === 0 && existsSync(RUN_DIR)) {
  for (const d of readdirSync(RUN_DIR)) {
    try {
      const r: ScriptRun = JSON.parse(readFileSync(join(RUN_DIR, d, "run.json"), "utf8"));
      if (r.issue?.status === "sending") r.issue = { status: "error", message: "เซิร์ฟเวอร์รีสตาร์ทระหว่างส่ง — กดส่งใหม่", at: r.issue.at };
      runs.set(r.id, r);
    } catch {
      /* โฟลเดอร์ที่ไม่มี run.json (เช่น รันค้างตอนปิดเซิร์ฟเวอร์) ข้ามไป */
    }
  }
  for (const r of [...runs.values()].filter((r) => r.finishedAt).sort((a, b) => a.finishedAt!.localeCompare(b.finishedAt!))) {
    const bot = getBotById(r.botId);
    if (bot) tally(bot, r);
  }
}

export const listRuns = (limit = KEEP_RUNS) => [...runs.values()].sort((a, b) => b.queuedAt.localeCompare(a.queuedAt)).slice(0, limit);
export const getRun = (id: string) => runs.get(id);

// zero-touch (ลุงจืด 2026-10-29): รอบล่าสุดของสคริปต์ที่ไม่ผ่าน/ตัวรันขัดข้อง แต่ไม่มี ticket และไม่มีเหตุผลจากกฎหรือ AI
// (รีสตาร์ตกลางด่าน AI หรือระหว่างส่ง, ส่ง IssueMate ไม่สำเร็จ, รันตอนกฎเก่าที่ให้คนกดส่ง) → รันใหม่เองตอนเซิร์ฟเวอร์เริ่ม ผลใหม่เข้าด่านเปิด ticket ตามปกติ
// ponytail: เก็บเฉพาะตอนสตาร์ต — ส่งไม่สำเร็จระหว่างวันรอรีสตาร์ตครั้งหน้า; ทำเป็นรอบเวลาเมื่อเจอค้างบ่อย
// สคริปต์ auto-* ที่รอบล่าสุดยังพังเอง (AI ซ่อมไม่ได้ ซ่อมแล้วยังพัง หรือรีสตาร์ตกลางการซ่อม) → ปลดออกจากคลังเลย ไม่รอคน
export function rerunStranded(): { rerun: string[]; retired: string[] } {
  if (!getSettings().autoIssueMate) return { rerun: [], retired: [] };
  const latest = new Map<string, ScriptRun>();
  for (const r of runs.values()) if ((latest.get(r.scriptId)?.queuedAt ?? "") < r.queuedAt) latest.set(r.scriptId, r);
  const bad = [...latest.values()].filter((r) => r.status === "failed" || r.status === "error");
  const retired = bad.filter((r) => r.noIssue && retireRun(r)).map((r) => (save(r), r.scriptId));
  const ids = bad.filter((r) => (!r.issue || r.issue.status === "error") && !r.noIssue).map((r) => r.scriptId);
  return { rerun: ids.length ? startRuns(ids).runs.map((r) => r.scriptId) : [], retired };
}

// zero-touch (ลุงจืด 2026-10-29): สคริปต์ auto-* ที่ AI เสนอเองแล้ว AI ซ่อมไม่ได้หรือซ่อมแล้วยังพัง → ปลดออกจากคลังเอง (uat-scripts.ts retireScript)
export function retireRun(run: ScriptRun): boolean {
  if (!retireScript(run.scriptId)) return false;
  run.retired = true;
  run.noIssue = `${run.noIssue ?? ""} · ปลดสคริปต์ออกจากคลังแล้ว (uat-scripts/retired/)`;
  return true;
}
export const activeRunCount = () => [...runs.values()].filter((r) => r.status === "queued" || r.status === "running").length;

const save = (r: ScriptRun) => {
  mkdirSync(join(RUN_DIR, r.id), { recursive: true });
  writeFileSync(join(RUN_DIR, r.id, "run.json"), JSON.stringify(r, null, 1));
  recordRun(r); // ประวัติถาวร: รอบที่จบแล้วเท่านั้น, ได้ ticket ทีหลังจึงจดอีกบรรทัด (src/lib/run-history.ts)
};

// retestOf = เลข issue ที่สั่งตรวจซ้ำหลังแก้ (ผลจะถูกแจ้งกลับใน issue นั้น) · healOf = รอบที่สคริปต์พังเอง (ลองฉบับที่ AI ซ่อม) · nightly = วันที่ไทยของรอบกลางคืนที่สั่ง (nightly.ts) · retryOf = รอบที่ตัวรันขัดข้องแล้วลองใหม่
export function startRuns(scriptIds: string[], retestOf?: string, healOf?: string, nightly?: string, retryOf?: string): { runs: ScriptRun[]; unknown: string[] } {
  const { scripts } = loadScripts();
  if (!activeRunCount()) Object.assign(batch, { p: 0, f: 0, e: 0, ids: [] });
  const s = getSettings();
  const out: ScriptRun[] = [];
  const unknown: string[] = [];
  for (const sid of scriptIds) {
    const sc = scripts.find((x) => x.id === sid);
    const bot = sc && getBots().find((b) => b.role === sc.module && b.lens === sc.lens);
    if (!sc || !bot) { unknown.push(sid); continue; }
    const id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).toUpperCase();
    const run: ScriptRun = {
      id, scriptId: sc.id, scriptTitle: sc.title, module: sc.module, lens: sc.lens, severityOnFail: sc.severityOnFail, botId: bot.id,
      target: s.erpTargetUrl, headed: s.headed, status: "queued", queuedAt: new Date().toISOString(),
      steps: [], passed: 0, failed: 0, skipped: 0, issues: 0, retestOf, ai: sc.ai, healOf, nightly, retryOf,
    };
    runs.set(id, run);
    queue.push(id);
    addEvent(bot, "info", `เข้าคิวรันสคริปต์ "${sc.title}"`);
    out.push(run);
  }
  pump();
  return { runs: out, unknown };
}

function pump() {
  const max = getSettings().maxParallelBots;
  while (queue.length && procs.size < max) launch(runs.get(queue.shift()!)!);
}

function launch(run: ScriptRun) {
  const bot = getBotById(run.botId)!;
  const outDir = join(RUN_DIR, run.id);
  mkdirSync(outDir, { recursive: true });
  run.status = "running";
  run.startedAt = new Date().toISOString();
  bot.status = "running";
  bot.currentTask = { id: run.id, title: run.scriptTitle, kind: "script", status: "running", startedAt: run.startedAt, runId: run.id, scriptId: run.scriptId };
  bot.stats.lastActive = run.startedAt;

  const script = loadScripts().scripts.find((x) => x.id === run.scriptId);
  if (!script) {
    run.status = "error";
    run.message = "ไม่พบไฟล์สคริปต์แล้ว (ถูกลบหรือแก้ไม่ผ่านการตรวจ)";
    return finish(run);
  }
  const file = run.healOf ? join(RUN_DIR, run.healOf, "heal.json") : script.file;
  const child = spawn(process.execPath, [RUNNER, "--script", file, "--out", outDir, "--base", run.target], {
    env: { ...process.env, UAT_RUN_ID: run.id, UAT_HEADED: run.headed ? "1" : "", UAT_BRAIN_MODEL: getSettings().brainModel, UAT_EYES_MODEL: getSettings().eyesModel },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: !run.headed,
  });
  procs.set(run.id, child);
  run.pid = child.pid;

  let buf = "";
  let err = "";
  // setEncoding ต่ออักษรไทยที่ถูกตัดคร่อมก้อนข้อมูลให้ — toString ทีละก้อนทำให้ตัวอักษรเพี้ยนเป็น �
  child.stdout!.setEncoding("utf8");
  child.stderr!.setEncoding("utf8");
  child.stdout!.on("data", (d: string) => {
    buf += d;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onLine(run, redact(line));
    }
  });
  child.stderr!.on("data", (d: string) => { err = redact(err + d).slice(-2000); });
  child.on("error", (e) => { err = e.message; });
  child.on("close", (code) => {
    procs.delete(run.id);
    if (run.status === "running") {
      run.status = "error";
      run.message = (err.trim() || `ตัวรันจบการทำงานก่อนส่งผลสรุป (exit ${code})`).slice(0, 500);
    }
    finish(run);
  });
}

function onLine(run: ScriptRun, line: string) {
  let m: Record<string, unknown>;
  try { m = JSON.parse(line); } catch { return; }
  const bot = getBotById(run.botId)!;
  if (m.t === "plan") {
    run.steps = (m.steps as StepResult[]).map((s) => ({ i: s.i, title: s.title, kind: s.kind, cleanup: !!s.cleanup, status: "pending" }));
  } else if (m.t === "step") {
    const st = run.steps[m.i as number];
    if (!st) return;
    Object.assign(st, { status: m.status, durationMs: m.durationMs, detail: m.detail, expected: m.expected, actual: m.actual, evidence: m.evidence, findings: m.findings, flaky: m.flaky === true || undefined });
    if (m.query) st.query = String(m.query);
    if (m.status === "passed") addEvent(bot, "pass", `ขั้น ${st.i + 1}: ${st.title}`);
    else if (m.status === "failed") addEvent(bot, "fail", `ขั้น ${st.i + 1}: ${st.title} — ${st.detail ?? ""}`);
    else if (m.status === "skipped") addEvent(bot, "skip", `ขั้น ${st.i + 1}: ${st.title} (ข้าม)`);
  } else if (m.t === "live") {
    run.liveAt = new Date().toISOString(); // runner เขียน runs/<id>/live.jpg ใหม่แล้ว
  } else if (m.t === "end") {
    run.status = m.status === "passed" ? "passed" : m.status === "failed" ? "failed" : "error";
    run.passed = Number(m.passed) || 0;
    run.failed = Number(m.failed) || 0;
    run.skipped = Number(m.skipped) || 0;
    run.issues = Number(m.issues) || 0;
    if (m.message) run.message = String(m.message);
  }
}

// นับรอบที่จบแล้วเข้าประวัติ/สถิติของบอท — ใช้ตอนรอบจบ และตอนเปิดเซิร์ฟเวอร์ใหม่ (สถานะบอทอยู่แค่ในหน่วยความจำ)
function tally(bot: BotConfig, run: ScriptRun): BotTask {
  const ok = run.status === "passed";
  const task: BotTask = { id: run.id, title: run.scriptTitle, kind: "script", startedAt: run.startedAt ?? run.queuedAt, status: ok || run.status === "failed" ? "completed" : run.status === "error" ? "error" : "idle", finishedAt: run.finishedAt, runId: run.id, scriptId: run.scriptId,
    result: `${ok ? "ผ่าน" : run.status === "failed" ? "ไม่ผ่าน" : run.status === "stopped" ? "หยุดโดยผู้ใช้" : "ผิดพลาด"} · ผ่าน ${run.passed} ไม่ผ่าน ${run.failed} ข้าม ${run.skipped}${run.message ? ` · ${run.message}` : ""}` };
  bot.taskHistory.unshift(task);
  bot.taskHistory.length = Math.min(bot.taskHistory.length, 30);
  bot.stats.runs += 1;
  if (ok) bot.stats.passed += 1;
  else if (run.status === "failed") bot.stats.failed += 1;
  bot.stats.stepsChecked += run.passed + run.failed;
  bot.stats.lastActive = run.finishedAt ?? null;
  return task;
}

function finish(run: ScriptRun) {
  run.finishedAt = new Date().toISOString();
  const bot = getBotById(run.botId)!;
  const ok = run.status === "passed";
  const task = tally(bot, run);
  addEvent(bot, ok ? "pass" : "fail", `จบสคริปต์ "${run.scriptTitle}": ${task.result}`);

  const next = [...runs.values()].find((r) => r.botId === bot.id && r.status === "running");
  if (next) {
    bot.currentTask = { ...task, id: next.id, title: next.scriptTitle, status: "running", startedAt: next.startedAt!, finishedAt: undefined, result: undefined, runId: next.id, scriptId: next.scriptId };
  } else {
    bot.currentTask = undefined;
    bot.status = run.status === "error" ? "error" : run.status === "stopped" ? "idle" : "completed";
  }
  save(run);
  pump();
  // ตรวจไม่ผ่าน → เปิด issue ให้หาวิธีแก้ทันที (ลุงจืดสั่ง 2026-10-29) · สคริปต์ ask-* ที่ AI เขียนเองจะมีหมายเหตุใน issue ให้ตรวจสคริปต์ก่อน
  // ยกเว้นพังเพราะตัวสคริปต์เอง (ไม่ใช่หลักฐานว่าระบบผิด) — รอบตรวจซ้ำของ issue ยังส่งเสมอ ให้คนแก้รู้ผล
  // สคริปต์ auto-* ที่ AI เสนอเองเปิด ticket เองโดยไม่รอคน ผ่านด่าน AI เดียวกับ ask-* (ลุงจืดสั่ง 2026-10-29 รอบ 2)
  if (run.status === "failed" && getSettings().autoIssueMate) void autoIssue(run, bot);
  // รอบลองสคริปต์ที่ AI ซ่อมไม่ปิดวงจร issue เดิม: สคริปต์เปลี่ยนแล้ว ผ่านไม่ได้แปลว่าบั๊กเดิมหาย
  if (ok && run.healOf) void import("./command").then((m) => m.promoteHeal(run));
  else if (ok) void closeLoop(run);

  batch[ok ? "p" : run.status === "failed" ? "f" : "e"]++;
  (batch.ids ??= []).push(run.id);
  pushActivity({ kind: "run", status: run.status, runId: run.id, scriptId: run.scriptId, passed: run.passed, failed: run.failed, text: `${run.scriptTitle} · ${task.result}` });
  if (!activeRunCount()) {
    const n = batch.p + batch.f + batch.e;
    pushActivity({ kind: "batch", passed: batch.p, failed: batch.f + batch.e, text: `จบชุดทดสอบ ${n} สคริปต์ · ผ่าน ${batch.p} · ไม่ผ่าน ${batch.f}${batch.e ? ` · ผิดพลาด/หยุด ${batch.e}` : ""}` });
    // จบชุด → ให้ AI คิดสคริปต์ทดสอบเพิ่มเอง (import ตอนเรียก กัน import วน command ↔ uat-runs)
    const ids = batch.ids;
    void import("./command").then((m) => m.proposeScripts(ids));
  }
  // ตัวรันขัดข้อง/เกินเวลา → ลองใหม่เอง 1 ครั้ง (zero-touch ลุงจืด 2026-10-29) · ลองแล้วยังขัดข้อง → rerunStranded รันใหม่ตอนเซิร์ฟเวอร์เริ่มครั้งหน้า
  if (run.status === "error" && !run.retryOf) startRuns([run.scriptId], run.retestOf, run.healOf, run.nightly, run.id);
}

// สคริปต์ผ่าน: ปลดตัวกันส่งซ้ำ แล้วแจ้งใน issue เดิมว่าตรวจซ้ำผ่าน (ปิดวงจร สร้าง → ตรวจ → แก้ → ตรวจซ้ำ)
// สคริปต์ที่ AI เขียน (ask-*, MCP save_script) ผ่านด่าน AI ก่อน: ชี้ชัดว่าสคริปต์ผิดเอง → ไม่เปิด (กดส่งเองได้), ERP ผิด/ไม่แน่ใจ → เปิดตามเดิม
// สคริปต์ AI ที่ผิดเอง → AI ซ่อมแล้วลองรันก่อนบันทึก (รอบลองไม่ซ่อมต่อ กันวน) · รอบลองที่เปิด issue ได้ = ไปถึง ERP แล้ว → บันทึกฉบับซ่อม
async function autoIssue(run: ScriptRun, bot: BotConfig) {
  const fault = run.retestOf ? undefined : scriptFault(run);
  let own = fault && `ขั้น ${fault.i + 1}: ${(fault.detail ?? "").slice(0, 120)}`;
  if (fault) run.noIssue = `สคริปต์พังเอง ยังไม่ได้ตรวจ ERP (${own}) — แก้สคริปต์แล้วรันใหม่`;
  else if (!run.retestOf && run.ai) {
    const why = await aiTriage(run, join(RUN_DIR, run.id), getSettings().analystModel);
    if (why) run.noIssue = `AI ตรวจแล้วเห็นว่าสคริปต์ผิดเอง: ${(own = why)} — ถ้าเป็นบั๊กจริงกด "ส่งเข้า IssueMate" ที่หน้ารอบนี้`;
  }
  if (run.healOf && !own) void import("./command").then((m) => m.promoteHeal(run)); // ไปถึง ERP แล้ว
  if (!run.noIssue) return void (await sendToIssueMate(run));
  if (run.healOf && own) {
    run.noIssue = `สคริปต์ที่ AI ซ่อมยังพังเอง ไม่บันทึกทับ: ${run.noIssue}`;
    retireRun(run);
  } else if (own && run.ai && !run.healOf) {
    const trial = await import("./command").then((m) => m.healScript(run, own!));
    if (trial) run.noIssue += ` · AI ซ่อมสคริปต์แล้ว กำลังลองรอบ ${trial} ก่อนบันทึก`;
  }
  addEvent(bot, "info", `ไม่เปิด issue: "${run.scriptTitle}" ${run.noIssue}`);
  save(run);
}

async function closeLoop(run: ScriptRun) {
  const codes = [...new Set([...clearSent(run.scriptId), ...(run.retestOf ? [run.retestOf] : [])])];
  for (const code of codes) {
    let note = "";
    try {
      await commentIssue(code, `✅ UAT ตรวจซ้ำผ่านแล้ว: ${run.scriptTitle} (run ${run.id}) ผ่าน ${run.passed} ขั้น บน ${run.target}`);
    } catch (e) {
      note = ` (แจ้งใน IssueMate ไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)})`;
    }
    pushActivity({ kind: "fixed", code, runId: run.id, scriptId: run.scriptId, text: `${code} ตรวจซ้ำผ่าน — ${run.scriptTitle}${note}` });
  }
}

const ISSUE_TEXT: Record<IssueLink["status"], (i: IssueLink) => string> = {
  sending: () => "กำลังส่งเข้า IssueMate",
  sent: (i) => `ส่งเข้า IssueMate แล้ว ${i.code}`,
  duplicate: (i) => `ไม่ส่งซ้ำ — ${i.message}`,
  error: (i) => `ส่งเข้า IssueMate ไม่สำเร็จ: ${i.message}`,
};

// สมอง AI วิเคราะห์รอบที่พัง แล้วเปิด issue ใน IssueMate (โปรเจกต์ SMLAIACC) ให้ทีม/AI ฝั่ง IssueMate แก้ต่อ
export async function sendToIssueMate(run: ScriptRun): Promise<ScriptRun> {
  if (run.issue?.status === "sending") return run;
  run.issue = { status: "sending", at: new Date().toISOString() };
  try {
    run.issue = await reportRun(run, join(RUN_DIR, run.id));
  } catch (e) {
    run.issue = { status: "error", message: e instanceof Error ? e.message : String(e), at: new Date().toISOString() };
  }
  let text = `${run.scriptTitle}: ${ISSUE_TEXT[run.issue.status](run.issue)}`;
  if (run.retestOf && run.issue.status !== "error") {
    const first = run.steps.find((st) => st.status === "failed");
    const newer = run.issue.code && run.issue.code !== run.retestOf ? ` → ปัญหาใหม่เปิดเป็น ${run.issue.code}` : "";
    try {
      await commentIssue(run.retestOf, `❌ UAT ตรวจซ้ำยังไม่ผ่าน: ${run.scriptTitle} (run ${run.id}) ${first ? `ขั้น ${first.i + 1} ${first.title} — ${first.detail ?? ""}` : run.message ?? ""}${newer}`);
    } catch (e) {
      text += ` (แจ้งผลใน ${run.retestOf} ไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)})`;
    }
  }
  const bot = getBotById(run.botId);
  if (bot) addEvent(bot, run.issue.status === "error" ? "error" : "info", text);
  pushActivity({ kind: "issue", status: run.issue.status, code: run.issue.code, runId: run.id, scriptId: run.scriptId, text });
  save(run);
  return run;
}

export function stopRun(id: string): ScriptRun | null {
  const run = runs.get(id);
  if (!run) return null;
  if (run.status === "queued") {
    queue.splice(queue.indexOf(id), 1);
    run.status = "stopped";
    run.finishedAt = new Date().toISOString();
    save(run);
  } else if (run.status === "running") {
    run.status = "stopped";
    run.message = "ผู้ใช้สั่งหยุด";
    for (const s of run.steps) if (s.status === "pending" || s.status === "running") s.status = "skipped";
    const pid = procs.get(id)?.pid;
    // ปิดทั้งต้นไม้โพรเซส (ตัวรัน + Chrome ที่มันเปิด) — close handler จะเรียก finish ให้เอง
    if (pid && process.platform === "win32") execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => {});
    else procs.get(id)?.kill("SIGKILL");
  }
  return run;
}
