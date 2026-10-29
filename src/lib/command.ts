import { readFileSync } from "node:fs";
import { BotConfig, BotTask } from "@/types/bot";
import { askBrain, webResearch } from "./brain";
import { SCRIPT_FORMAT, saveScript } from "./mcp";
import { addEvent, getBotById, getBots, getSettings } from "./swarm-store";
import { psqlRead } from "./uat-health";
import { startRuns } from "./uat-runs";
import { loadScripts } from "./uat-scripts";

// สั่งงานตรวจ: ผู้ใช้พิมพ์ว่าจะตรวจอะไร → สมอง AI เลือกบอท → แต่ละบอทเขียนสคริปต์ → ตัวรันเดิมต่อ PostgreSQL/เว็บ/API จริง
const MAX_PICK = 6;
type Step = { title?: string; do?: string; method?: string };
type Script = { title: string; steps: Step[]; cleanup?: Step[]; severityOnFail?: string };

const PICK_SCHEMA = { type: "object", properties: { botIds: { type: "array", items: { type: "string" } } }, required: ["botIds"] };
const SCRIPT_SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, severityOnFail: { type: "string" }, steps: { type: "array", items: { type: "object" } }, cleanup: { type: "array", items: { type: "object" } } },
  required: ["title", "steps"],
};

const json = (text: string) => JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replaceAll(process.env.UAT_PG_PASSWORD || "\u0000", "***");

// คอลัมน์จริงของตารางที่คำสั่ง/หน้าที่บอท/สคริปต์เดิมพูดถึง — ให้ AI เขียน SQL จากของจริง ไม่เดาชื่อ
async function realColumns(text: string): Promise<string> {
  // ponytail: คำที่มี _ = ผู้สมัครเป็นชื่อตาราง; จำกัดตัวอักษร a-z0-9_ จึงใส่ใน SQL ตรงๆ ได้ปลอดภัย
  const names = [...new Set(text.toLowerCase().match(/\b[a-z][a-z0-9]*_[a-z0-9_]{1,60}\b/g) ?? [])].slice(0, 80);
  if (!names.length) return "(ไม่พบชื่อตาราง)";
  const out = await psqlRead(
    `select table_name, string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name in (${names.map((n) => `'${n}'`).join(",")}) group by 1 order by 1`,
    15000,
  );
  const lines = out.trim().split("\n").filter(Boolean).slice(0, 15);
  return lines.map((l) => l.replace("|", ": ").slice(0, 1500)).join("\n") || "(ไม่พบตารางเหล่านี้ในฐาน Demo)";
}

// ค้นเว็บครั้งเดียวต่อคำสั่ง (บอทหลายตัวที่รับคำสั่งเดียวกันใช้ผลร่วมกัน): กฎทางการ + วิธีที่โปรแกรมบัญชีอื่นทำ
// ponytail: แคชในหน่วยความจำ ล้างทิ้งเมื่อเกิน 50 คำสั่ง
const refsCache = new Map<string, Promise<string>>();
function researchFor(command: string) {
  if (refsCache.size > 50) refsCache.clear();
  const q = command.slice(0, 120);
  if (!refsCache.has(q)) refsCache.set(q, webResearch([`${q} กรมสรรพากร หลักเกณฑ์`, `${q} โปรแกรมบัญชี วิธีบันทึก`]));
  return refsCache.get(q)!;
}

// AI เลือกบอทที่เกี่ยวกับคำสั่ง (ไม่เกิน MAX_PICK ตัว)
async function pickBots(command: string): Promise<BotConfig[]> {
  const bots = getBots();
  const list = bots.map((b) => `${b.id} | ${b.name} | ${b.focus}`).join("\n");
  // ponytail: ดึงรหัส bot-NN จากคำตอบตรงๆ เพราะโมเดลไม่ยึดชื่อช่องใน schema เสมอ (ทดสอบ 2026-10-29 ตอบ "bots" แทน "botIds")
  const text = await askBrain(
    getSettings().brainModel,
    `คุณคือหัวหน้าทีม UAT ของ SML AI Account มีบอท 30 ตัว (10 โมดูล × 3 มุมตรวจ: หน้าจอ ฐานข้อมูล API) เลือกบอทที่ต้องลงมือตามคำสั่ง 1-${MAX_PICK} ตัว เฉพาะที่เกี่ยวจริง ตอบ JSON เท่านั้น`,
    `คำสั่ง: ${command}\n\nบอท (id | ชื่อ | หน้าที่):\n${list}`,
    [],
    PICK_SCHEMA,
  );
  const ids: string[] = text.match(/bot-\d{2}/g) ?? [];
  return bots.filter((b) => ids.includes(b.id)).slice(0, MAX_PICK);
}

// สคริปต์จากคำสั่งอ่านอย่างเดียว: SQL/API ที่ AI แต่งเองห้ามเขียนฐาน · บันทึกเอกสารทดสอบทำได้ผ่าน ui.play เท่านั้น
function readOnlyGuard(sc: Script) {
  const bad = [...sc.steps, ...(sc.cleanup ?? [])].find((s) => s?.do === "db.exec" || s?.do === "ui.adminLogin" || (s?.do === "api.request" && String(s.method ?? "GET").toUpperCase() !== "GET"));
  if (bad) throw new Error(`ขั้น "${bad.title}" ถูกห้าม: สคริปต์จากคำสั่งต้องอ่านอย่างเดียว (ห้าม db.exec, ห้าม ui.adminLogin, api.request ใช้ GET เท่านั้น)`);
}

// ให้ AI เขียนสคริปต์ของบอทนี้ แล้วบันทึกผ่านตัวตรวจเดียวกับ MCP save_script (ผิดแล้วให้แก้อีก 1 รอบ)
async function writeScript(bot: BotConfig, id: string, command: string): Promise<Script> {
  const mine = loadScripts().scripts.filter((s) => s.module === bot.role && !s.id.startsWith("ask-"));
  const example = mine.find((s) => s.lens === bot.lens) ?? mine[0];
  const refs = await researchFor(command);
  const cols = await realColumns(`${command} ${bot.focus} ${mine.map((s) => readFileSync(s.file, "utf8")).join(" ")}`);
  const system = `${bot.systemPrompt}

เว็บที่ทดสอบ: ${getSettings().erpTargetUrl} · ฐาน PostgreSQL = ฐาน Demo (ตัวรันต่อให้จริง)
งานตอนนี้: แปลงคำสั่งของหัวหน้าเป็นสคริปต์ UAT 1 ไฟล์ที่ตัวรันจะรันจริง (ต่อ PostgreSQL เปิดเว็บ เรียก API จริง) ห้ามตอบเป็นแผนหรือคำอธิบาย ตอบเป็น JSON ของสคริปต์เท่านั้น
${SCRIPT_FORMAT}
กติกา:
- ทำเฉพาะส่วนของคำสั่งที่ตรงกับหน้าที่ของคุณ ใช้ขั้นตามมุมตรวจ: ฐานข้อมูล → db.query, API → api.request, หน้าจอ → ui.* (เริ่มด้วย ui.demoLogin; ไม่รู้ selector ให้ ui.openMenu แล้วใช้ ui.play {goal})
- SQL ใช้เฉพาะตารางและคอลัมน์ใน "คอลัมน์จริง" ห้ามเดาชื่อ · ตรวจแบบนับแถวที่ผิด select count(*) as n ... แล้ว expect {col:"n",op:"eq",value:0}
- อ่านอย่างเดียว: ห้าม db.exec, api.request ใช้ GET เท่านั้น · เงินเทียบตรงเป๊ะ ห้ามปัดเศษ
- title ของสคริปต์และทุกขั้นเป็นภาษาไทยที่ผู้ใช้ทั่วไปเข้าใจ · 2-10 ขั้น

ข้อมูลอ้างอิงจากเว็บ (ใช้เฉพาะส่วนที่เกี่ยวกับคำสั่ง · ถ้าใช้ตัดสินว่าถูก/ผิด ให้ใส่ URL ไว้ใน description ของสคริปต์):
${refs || "(ค้นไม่เจอ)"}

ตัวอย่างสคริปต์ที่รันผ่านจริงของโมดูลนี้:
${example ? readFileSync(example.file, "utf8").slice(0, 3000) : "(ไม่มี)"}

คอลัมน์จริงใน PostgreSQL:
${cols}`;

  let err = "";
  for (let round = 0; round < 2; round++) {
    const text = await askBrain(getSettings().scriptModel, system, `คำสั่ง: ${command}${err ? `\n\nสคริปต์รอบก่อนถูกปฏิเสธ: ${err} — แก้แล้วส่งใหม่` : ""}`, [], SCRIPT_SCHEMA);
    try {
      const raw = json(text);
      const sc = (raw.steps ? raw : (Object.values(raw).find((v) => (v as Script)?.steps) ?? raw)) as Script; // บางครั้งโมเดลห่อไว้ใน {script:{...}}
      if (!Array.isArray(sc.steps) || !sc.steps.length) throw new Error("ไม่มีขั้นตอน (steps ว่าง)");
      readOnlyGuard(sc);
      const severity = /^S[1-4]$/.test(String(sc.severityOnFail)) ? sc.severityOnFail : "S3";
      saveScript({ script: { ...sc, id, module: bot.role, lens: bot.lens, severityOnFail: severity, description: `สั่งงาน: ${command}${raw.description ? ` · ${raw.description}` : ""}` } });
      return sc;
    } catch (e) {
      err = errText(e);
    }
  }
  throw new Error(`AI เขียนสคริปต์ไม่ผ่านการตรวจ: ${err}`);
}

// บอท 1 ตัวรับคำสั่ง → เขียนสคริปต์ ask-<โมดูล>-<มุม> → เข้าคิวรันจริง · บันทึกลงประวัติงานของบอท
// ponytail: id คงที่ต่อบอท (สั่งใหม่ = ทับของเดิม) กันไฟล์รก — ถ้าสั่งซ้ำขณะรอบเก่ายังรอคิว รอบนั้นจะรันสคริปต์ใหม่
export async function commandBot(botId: string, command: string, title?: string): Promise<BotConfig | null> {
  const bot = getBotById(botId);
  if (!bot) return null;
  const task: BotTask = { id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: title || command.slice(0, 40), kind: "agent", status: "running", startedAt: new Date().toISOString(), prompt: command };
  try {
    const id = `ask-${bot.role}-${bot.lens}`;
    const sc = await writeScript(bot, id, command);
    const run = startRuns([id]).runs[0];
    if (!run) throw new Error(`เข้าคิวรันสคริปต์ ${id} ไม่ได้`);
    Object.assign(task, {
      status: "completed",
      scriptId: id,
      runId: run.id,
      result: `เขียนสคริปต์ "${sc.title}" ${sc.steps.length} ขั้น แล้วสั่งรันจริง (รอบ ${run.id}):\n${sc.steps.map((s, i) => `${i + 1}. ${s.title ?? s.do}`).join("\n")}`,
    });
    addEvent(bot, "info", `รับคำสั่ง → เขียนสคริปต์ ${id} แล้วเข้าคิวรัน`);
  } catch (e) {
    task.status = "error";
    task.result = `ทำตามคำสั่งไม่สำเร็จ: ${errText(e)}`;
    addEvent(bot, "error", task.result);
  }
  task.finishedAt = new Date().toISOString();
  bot.taskHistory.unshift(task);
  bot.taskHistory.length = Math.min(bot.taskHistory.length, 30);
  bot.stats.lastActive = task.finishedAt;
  return bot;
}

// สั่งงานหลายบอท: ไม่ระบุ botIds = ให้ AI เลือกบอทเอง
export async function dispatch(command: string, botIds?: string[]): Promise<BotConfig[]> {
  const bots = botIds?.length ? getBots().filter((b) => botIds.includes(b.id)) : await pickBots(command);
  if (!bots.length) throw new Error("AI ไม่พบบอทที่เกี่ยวกับคำสั่งนี้ — ระบุโมดูลให้ชัดขึ้น หรือเลือกบอทเอง");
  const out: BotConfig[] = [];
  // ponytail: ทีละ 5 ตัวกันโดน rate limit ของ Ollama Cloud — ปรับตัวเลขถ้าแพ็กเกจรับได้มากกว่า
  for (let i = 0; i < bots.length; i += 5) {
    const batch = await Promise.all(bots.slice(i, i + 5).map((b) => commandBot(b.id, command, command.slice(0, 40))));
    out.push(...batch.filter((b): b is BotConfig => b !== null));
  }
  return out;
}
