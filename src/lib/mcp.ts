import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ScriptRun } from "@/types/bot";
import { pushActivity, waitActivity, waitAny } from "./activity";
import { scriptsForIssue } from "./issuemate";
import { logDays, readLogs, timed } from "./log";
import { nightLines } from "./nightly";
import { nightReport } from "./nightly-run";
import { getBots, getSettings, updateSettings } from "./swarm-store";
import { testDb } from "./test-db";
import { checkAll } from "./uat-health";
import { activeRunCount, getRun, listRuns, sendToIssueMate, startRuns, stopRun } from "./uat-runs";
import { SCRIPT_DIR, loadScripts } from "./uat-scripts";

// MCP tools ของ UAT Tester — คำอธิบายเป็นอังกฤษสั้นและผลลัพธ์เป็นบรรทัดกะทัดรัด เพื่อประหยัด token ของ AI ที่เรียก
const STEP_KINDS = ["ui.goto", "ui.demoLogin", "ui.adminLogin", "ui.openMenu", "ui.click", "ui.fill", "ui.select", "ui.press", "ui.readText", "ui.expectText", "ui.expectVisible", "ui.expectValue", "ui.expectUrl", "ui.expectClean", "ui.screenshot", "ui.pdf", "ui.act", "ui.see", "ui.play", "api.request", "report.pdf", "db.query", "db.exec", "wait", "set"];
export const SCRIPT_FORMAT = `Shape: {id(a-z0-9-),title,module(master|sales|purchase|inventory|gl|tax|reports|security|admin|recon),lens(screen|data|api),severityOnFail(S1-S4),description,steps[],cleanup[]}. Step = {title,do,...}; do: ${STEP_KINDS.join(" ")}. ui.adminLogin{targetPath:/admin/providers|/home} = System Admin login with server-held credentials (never put passwords in scripts). ui.act{instruction} = Stagehand does one plain-Thai action; ui.see{expect} = AI judges the screenshot; ui.play{goal,maxSteps<=30} = Computer Use loop (AI clicks/types until done, its findings fail the step, may save test docs tagged {{run.tag}}). api.request{method,path,body,expectStatus,expect[]}, report.pdf{body,contains[]} = download the PDF of a report like a user pressing print (POST /api/process/report/pdf, same body as /api/process/report/run) and require each text in contains; ui.pdf{selector,contains[]} = click a screen button that downloads a PDF (e.g. the download button of the print preview) and check it the same way (use numbers/doc numbers; some Thai tone marks are private-use glyphs in the PDF), db.query{sql,database,rows,expect[],save{var:col}} (read-only, psql :'var'), db.exec{sql,database,affected}; database = smldemo (default; db.exec only for rows prefixed UAT) | smluatadmin | smlerpmainuatadmin | uat_<name> from test_db (your own copy of smldemo: any change allowed). expect item {path|col,op:eq|ne|same|gt|gte|lt|lte|contains|matches|exists|empty,value}; {{var}} interpolation. Money compared as decimal.`;
const str = { type: "string" } as const;
const bool = { type: "boolean" } as const;
const strs = { type: "array", items: str } as const;

export const TOOLS = [
  {
    name: "status",
    description: "Tester health (ERP web, demo DB, brain, IssueMate), settings and counts. bots:true adds one line per bot. settings:{erpTargetUrl,brainModel,scriptModel,analystModel,eyesModel,autoIssueMate,autoScripts,autoRetest,maxParallelBots(1-10),headed,nightlyEnabled,nightlyTime(HH:MM Bangkok)} updates settings.",
    inputSchema: { type: "object", properties: { bots: bool, settings: { type: "object" } } },
  },
  {
    name: "scripts",
    description: "No id: list UAT scripts as 'id|module/lens|severity|steps|title'. With id: the full script JSON (use as a template for save_script).",
    inputSchema: { type: "object", properties: { id: str, module: str, lens: { type: "string", enum: ["screen", "data", "api"] } } },
  },
  {
    name: "save_script",
    description: `Create or replace uat-scripts/<id>.json; rejected (nothing saved) if invalid. ${SCRIPT_FORMAT}`,
    inputSchema: { type: "object", properties: { script: { type: "object" } }, required: ["script"] },
  },
  {
    name: "run",
    description: "Test the ERP: queue scripts and wait for results. Select by scriptIds, botIds, modules, all:true, or issue:'SMLAIACC-n' (re-test the script behind that issue after you fixed it; result is posted on the issue). Failed runs auto-open IssueMate issues (code in result). wait: seconds 0-120 (default 90); unfinished runs show as running, then use runs or events.",
    inputSchema: { type: "object", properties: { scriptIds: strs, botIds: strs, modules: strs, all: bool, issue: str, wait: { type: "integer", minimum: 0, maximum: 120 } } },
  },
  {
    name: "runs",
    description: "No id: recent runs 'id|status|script|pass/fail|issue'. With id: detail with failed steps (expected/actual); full:true lists every step. action:'stop' stops the run, action:'issue' sends it to IssueMate now.",
    inputSchema: { type: "object", properties: { id: str, full: bool, action: { type: "string", enum: ["stop", "issue"] }, status: str, limit: { type: "integer", minimum: 1, maximum: 60 } } },
  },
  {
    name: "command",
    description: "Plain-language test order (Thai ok), e.g. 'check trial balance debit=credit'. The tester picks the relevant bots (or use botIds), each bot writes a read-only script from real PostgreSQL columns and queues it on the real ERP/DB. Returns per bot: script id, steps, run id; then use runs/events for results. Failed ask-* runs also auto-open IssueMate issues (with a note to check the AI-written script first).",
    inputSchema: { type: "object", properties: { text: str, botIds: strs }, required: ["text"] },
  },
  {
    name: "events",
    description: "Feed from the tester to you: run results, batch summaries, issues opened, issues verified fixed. Long-poll: returns events after cursor 'after' (0 = all kept), waiting up to 'wait' seconds (max 50) if none. Reuse the returned cursor.",
    inputSchema: { type: "object", properties: { after: { type: "integer", minimum: 0 }, wait: { type: "integer", minimum: 0, maximum: 50 } } },
  },
  {
    name: "logs",
    description: "Persistent work log of this tester, one file per Thai day kept 30 days: brain (job pick|script|script-fallback|analyst, model, prompt/reply excerpt, ms), web (search query, hits), mcp (every AI tool call), activity (runs, batches, issues), api (route errors), server (start/stop). Use it to audit what the system did and find slow or failing parts to improve. Returns the day's summary (count/failed/avg+max ms per kind, top errors, slowest) and the latest matching entries.",
    inputSchema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD, default today" }, kind: { type: "string", enum: ["server", "activity", "brain", "web", "mcp", "api"] }, q: str, errors: { type: "boolean" }, limit: { type: "integer", minimum: 1, maximum: 500 } } },
  },
  {
    name: "test_db",
    description: "Your own throwaway test database whenever you need one (destructive/bulk/admin flows, clean state, parallel work) instead of touching shared smldemo. action:'create' copies smldemo into uat_<name> in seconds (max 5), then use database:'uat_<name>' in db.* steps; 'list'; 'drop' when done (only DBs made here).",
    inputSchema: { type: "object", properties: { action: { type: "string", enum: ["list", "create", "drop"] }, name: str }, required: ["action"] },
  },
  {
    name: "nightly",
    description: "Morning summary of the nightly full regression (all scripts except AI-written ask-*/auto-*; on/off + Bangkok time via status settings nightlyEnabled/nightlyTime, default off). date YYYY-MM-DD, default latest night. Counts pass/fail/skip, failed scripts with their IssueMate ticket, and the diff vs the previous night (new failures / fixed).",
    inputSchema: { type: "object", properties: { date: str } },
  },
  {
    name: "notify",
    description: "Show a short message to the human watching the tester web page (animated card), e.g. what you are fixing or about to test.",
    inputSchema: { type: "object", properties: { text: str }, required: ["text"] },
  },
];

// เครื่องมือที่ "สั่งงาน" → หน้าเว็บเล่นแอนิเมชันคำสั่งเข้า (เครื่องมืออ่านอย่างเดียวไม่รบกวนจอ)
const COMMANDS = new Set(["command", "run", "save_script", "notify", "status:settings", "runs:stop", "runs:issue", "test_db:create", "test_db:drop"]);

type Args = Record<string, unknown>;
const done = (r: ScriptRun) => !["queued", "running"].includes(r.status) && r.issue?.status !== "sending";
const issueTag = (r: ScriptRun) => (r.issue?.code ? r.issue.code : r.issue ? r.issue.status : "");
const line = (r: ScriptRun) => [r.id, r.status, r.scriptId, `${r.passed}/${r.failed}`, issueTag(r)].join("|");
const firstFail = (r: ScriptRun) => {
  const f = r.steps.find((s) => s.status === "failed");
  return f ? `  ✗ step ${f.i + 1} ${f.title}: ${f.detail ?? ""}${f.expected !== undefined ? ` · expected ${f.expected} got ${f.actual}` : ""}`.slice(0, 400) : r.message ? `  ! ${r.message.slice(0, 300)}` : "";
};
const lim = (n: unknown, d: number, max: number) => Math.min(Math.max(Number.isFinite(Number(n)) ? Number(n) : d, 0), max);

async function status(a: Args) {
  if (a.settings && typeof a.settings === "object") updateSettings(a.settings as Args);
  const h = await checkAll();
  const s = getSettings();
  const { scripts, errors } = loadScripts();
  const out = [
    ...(["erp", "db", "brain", "issuemate"] as const).map((k) => `${k}: ${h[k].ok ? "ok" : "FAIL"} ${h[k].message}`),
    `settings: target=${s.erpTargetUrl} brain=${s.brainModel} script=${s.scriptModel} analyst=${s.analystModel} eyes=${s.eyesModel} autoIssue=${s.autoIssueMate} autoScripts=${s.autoScripts} autoRetest=${s.autoRetest} parallel=${s.maxParallelBots} nightly=${s.nightlyEnabled ? s.nightlyTime : "off"}`,
    `scripts=${scripts.length}${errors.length ? ` invalid=${errors.map((e) => `${e.file}(${e.error})`).join(",")}` : ""} active=${activeRunCount()}`,
  ];
  if (a.bots) for (const b of getBots()) out.push(`${b.id}|${b.role}/${b.lens}|${b.status}|runs ${b.stats.runs} ✓${b.stats.passed} ✗${b.stats.failed}`);
  return out.join("\n");
}

function scripts(a: Args) {
  const all = loadScripts().scripts;
  if (a.id) {
    const sc = all.find((s) => s.id === a.id);
    if (!sc) throw new Error(`no script ${a.id}`);
    return readFileSync(sc.file, "utf8");
  }
  return all
    .filter((s) => (!a.module || s.module === a.module) && (!a.lens || s.lens === a.lens))
    .map((s) => [s.id, `${s.module}/${s.lens}`, s.severityOnFail, s.stepCount, s.title].join("|"))
    .join("\n");
}

// ชนิดขั้นต้องรู้จัก และห้ามมีความลับในไฟล์ — ใช้ตอนบันทึก และตอนลองสคริปต์ที่ AI ซ่อมก่อนบันทึก (command.ts healScript)
export function lintScript(sc: Args) {
  const steps = [...((sc.steps as Args[]) ?? []), ...((sc.cleanup as Args[]) ?? [])];
  const bad = steps.map((s, i) => (STEP_KINDS.includes(String(s?.do)) ? "" : `step ${i + 1} do="${s?.do}"`)).filter(Boolean);
  if (bad.length) throw new Error(`unknown step kind: ${bad.join(", ")}`);
  // ความลับห้ามอยู่ในไฟล์สคริปต์: ทั้งค่าจริงและการอ้าง {{env.*PASS/TOKEN/SECRET/KEY}}
  const body = JSON.stringify(sc);
  if (/\{\{\s*env\.\w*(PASS|TOKEN|SECRET|KEY)/i.test(body) || Object.entries(process.env).some(([k, v]) => /PASS|TOKEN|SECRET|KEY/i.test(k) && v && v.length >= 4 && body.includes(v))) throw new Error("script must not contain secrets or {{env.*secret}} — use ui.adminLogin");
  return steps;
}

export function saveScript(a: Args) {
  const sc = a.script as Args | undefined;
  if (!sc || typeof sc !== "object") throw new Error("script object required");
  if (typeof sc.id !== "string" || !/^[a-z0-9-]{3,80}$/.test(sc.id)) throw new Error("id must be 3-80 chars a-z 0-9 -");
  const steps = lintScript(sc);
  const file = join(SCRIPT_DIR, `${sc.id}.json`);
  const old = existsSync(file) ? readFileSync(file, "utf8") : null;
  writeFileSync(file, JSON.stringify({ cleanup: [], ...sc }, null, 2) + "\n");
  const err = loadScripts().errors.find((e) => e.file === `${sc.id}.json`);
  if (err) {
    if (old === null) unlinkSync(file);
    else writeFileSync(file, old);
    throw new Error(`invalid, not saved: ${err.error}`);
  }
  return `${old === null ? "created" : "updated"} ${sc.id} (${steps.length} steps)`;
}

async function run(a: Args, signal: AbortSignal) {
  const { scripts: all } = loadScripts();
  const issue = typeof a.issue === "string" ? a.issue.trim().toUpperCase() : "";
  let ids: string[] = Array.isArray(a.scriptIds) ? a.scriptIds.map(String) : [];
  if (a.all) ids = all.map((s) => s.id);
  const mods = Array.isArray(a.modules) ? a.modules.map(String) : [];
  const bots = Array.isArray(a.botIds) ? getBots().filter((b) => (a.botIds as string[]).includes(b.id)) : [];
  ids.push(...all.filter((s) => mods.includes(s.module) || bots.some((b) => b.role === s.module && b.lens === s.lens)).map((s) => s.id));
  if (issue) {
    const found = scriptsForIssue(issue);
    if (!found.length) throw new Error(`no script on record for ${issue} (it may have passed already, or was not opened by this tester) — pass scriptIds instead`);
    ids.push(...found);
  }
  ids = [...new Set(ids)];
  if (!ids.length) throw new Error("nothing selected: give scriptIds, botIds, modules, all or issue");
  const { runs, unknown } = startRuns(ids, issue || undefined);
  if (!runs.length) throw new Error(`unknown scripts: ${unknown.join(", ")}`);

  const until = Date.now() + lim(a.wait, 90, 120) * 1000;
  while (!signal.aborted && Date.now() < until && !runs.every((r) => done(getRun(r.id) ?? r))) await waitAny(until - Date.now(), signal);
  const now = runs.map((r) => getRun(r.id) ?? r);
  const head = `queued ${runs.length}${unknown.length ? ` (unknown: ${unknown.join(",")})` : ""} · passed ${now.filter((r) => r.status === "passed").length} · failed ${now.filter((r) => r.status === "failed").length} · pending ${now.filter((r) => !done(r)).length}`;
  return [head, ...now.flatMap((r) => [line(r), firstFail(r)].filter(Boolean))].join("\n");
}

async function runs(a: Args) {
  if (!a.id) {
    return listRuns()
      .filter((r) => !a.status || r.status === a.status)
      .slice(0, lim(a.limit, 15, 60))
      .map(line)
      .join("\n") || "no runs";
  }
  let r: ScriptRun | undefined = getRun(String(a.id));
  if (!r) throw new Error(`no run ${a.id}`);
  if (a.action === "stop") r = stopRun(r.id) ?? r;
  if (a.action === "issue") r = await sendToIssueMate(r);
  const steps = r.steps
    .filter((s) => a.full || s.status === "failed")
    .map((s) => `${s.i + 1}. ${s.status} ${s.title}${s.detail ? ` — ${s.detail}` : ""}${s.expected !== undefined ? ` · expected ${s.expected} got ${s.actual}` : ""}${s.evidence ? ` [${s.evidence}]` : ""}`);
  return [
    `${line(r)} · ${r.scriptTitle} · target ${r.target}${r.retestOf ? ` · retest of ${r.retestOf}` : ""}`,
    r.message ? `message: ${r.message}` : "",
    r.issue ? `issue: ${r.issue.status} ${r.issue.code ?? r.issue.message ?? ""}` : "",
    ...steps,
  ].filter(Boolean).join("\n");
}

async function events(a: Args, signal: AbortSignal) {
  const { seq, events } = await waitActivity(lim(a.after, 0, Number.MAX_SAFE_INTEGER), lim(a.wait, 0, 50) * 1000, signal);
  const rows = events.filter((e) => e.kind !== "mcp" && e.kind !== "note").map((e) => `#${e.seq} ${e.kind}${e.status ? `:${e.status}` : ""}${e.runId ? ` ${e.runId}` : ""}${e.code ? ` ${e.code}` : ""} ${e.text}`);
  return [`cursor ${seq}`, ...rows].join("\n");
}

export async function callTool(name: string, a: Args, client: string, signal: AbortSignal): Promise<string> {
  const tag = name === "status" && a.settings ? "status:settings" : (name === "runs" || name === "test_db") && a.action ? `${name}:${a.action}` : name;
  if (COMMANDS.has(tag)) {
    const what = name === "notify" ? String(a.text ?? "").slice(0, 300) : summarize(name, a);
    pushActivity({ kind: name === "notify" ? "note" : "mcp", client, tool: tag, text: what });
  }
  // ทุกการเรียกจาก AI ลง log (ใครเรียก อะไร นานเท่าไร ล้มเพราะอะไร) — events รอได้นาน ms สูงเป็นปกติ
  return timed("mcp", { client, tool: tag, args: JSON.stringify(a).slice(0, 500) }, () => dispatch(name, a, signal), (r) => ({ resultChars: r.length }));
}

async function dispatch(name: string, a: Args, signal: AbortSignal): Promise<string> {
  switch (name) {
    case "status": return status(a);
    case "scripts": return scripts(a);
    case "save_script": return saveFromMcp(a);
    case "run": return run(a, signal);
    case "command": return command(a);
    case "runs": return runs(a);
    case "events": return events(a, signal);
    case "logs": {
      const r = readLogs({ date: a.date as string, kind: a.kind as string, q: a.q as string, errors: !!a.errors, limit: lim(a.limit, 50, 500) });
      return JSON.stringify({ days: logDays().slice(0, 30), ...r });
    }
    case "test_db": return testDb(String(a.action ?? ""), String(a.name ?? ""));
    case "nightly": return nightly(a);
    case "notify":
      if (!String(a.text ?? "").trim()) throw new Error("text required");
      return "shown";
    default: throw new Error(`unknown tool ${name}`);
  }
}

// ผู้เรียก MCP คือ AI (antigravity ฯลฯ) → ตรวจตัวแปร/ตาราง-คอลัมน์แบบเดียวกับ ✨ คำสั่ง และติด ai: true ให้ไม่ถูกนับเป็นสคริปต์ที่คนเขียน
// (2026-10-29 SMLAIACC-231: ask-purchase-api บันทึกผ่าน MCP ข้ามตัวตรวจ ยิง path ผิด → เปิด ticket เป็นสคริปต์คนเขียน)
async function saveFromMcp(a: Args) {
  const sc = a.script as Args | undefined;
  if (sc && typeof sc === "object" && Array.isArray(sc.steps)) await (await import("./command")).checkScript(sc as never);
  return saveScript({ ...a, script: sc && typeof sc === "object" ? { ...sc, ai: true } : sc });
}

async function nightly(a: Args) {
  const date = typeof a.date === "string" ? a.date : undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
  const r = await nightReport(date);
  const cfg = `nightly ${r.enabled ? "ON" : "OFF"} ${r.time} Asia/Bangkok · nights: ${r.nights.slice(0, 7).join(",") || "none yet"}`;
  return [cfg, ...(r.summary ? nightLines(r.summary) : [date ? `no night run on ${date}` : "no night run yet"])].join("\n");
}

// import ตอนเรียก กัน import วนกับ command.ts (ซึ่งใช้ saveScript ของไฟล์นี้)
async function command(a: Args) {
  const text = String(a.text ?? "").trim().slice(0, 1000);
  if (!text) throw new Error("text required");
  const { dispatch } = await import("./command");
  const bots = await dispatch(text, Array.isArray(a.botIds) ? a.botIds.map(String) : undefined);
  return bots
    .map((b) => {
      const t = b.taskHistory[0];
      return `${b.id} ${b.name} | ${t?.status} | ${t?.scriptId ?? "-"} | run ${t?.runId ?? "-"}\n${t?.result ?? ""}`;
    })
    .join("\n\n");
}

// ข้อความไทยสั้นบนการ์ดแอนิเมชันเมื่อ AI สั่งงาน
function summarize(name: string, a: Args): string {
  if (name === "command") return `สั่งงานตรวจ: ${String(a.text ?? "").slice(0, 80)}`;
  if (name === "run") {
    if (a.issue) return `ตรวจซ้ำหลังแก้ ${a.issue}`;
    if (a.all) return "รันทุกสคริปต์";
    const parts = [...((a.scriptIds as string[]) ?? []), ...((a.modules as string[]) ?? []).map((m) => `โมดูล ${m}`), ...((a.botIds as string[]) ?? [])];
    return `รัน ${parts.slice(0, 4).join(", ")}${parts.length > 4 ? ` +${parts.length - 4}` : ""}`;
  }
  if (name === "save_script") return `บันทึกสคริปต์ ${(a.script as Args)?.id ?? ""}`;
  if (name === "runs") return a.action === "stop" ? `หยุดรอบ ${a.id}` : `ส่งรอบ ${a.id} เข้า IssueMate`;
  if (name === "test_db") return `${a.action === "create" ? "สร้าง" : "ลบ"}ฐานทดสอบ uat_${String(a.name ?? "").replace(/^uat_/, "")}`;
  return "ปรับการตั้งค่า";
}
