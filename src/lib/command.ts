import { readFileSync } from "node:fs";
import { BotConfig, BotTask, ScriptRun } from "@/types/bot";
import { pushActivity } from "./activity";
import { askBrain, webResearch } from "./brain";
import { SCRIPT_FORMAT, saveScript } from "./mcp";
import { addEvent, getBotById, getBots, getSettings } from "./swarm-store";
import { psqlRead } from "./uat-health";
import { getRun, startRuns } from "./uat-runs";
import { loadScripts } from "./uat-scripts";

// สั่งงานตรวจ: ผู้ใช้พิมพ์ว่าจะตรวจอะไร → สมอง AI เลือกบอท → แต่ละบอทเขียนสคริปต์ → ตัวรันเดิมต่อ PostgreSQL/เว็บ/API จริง
const MAX_PICK = 6;
type Step = { title?: string; do?: string; method?: string; sql?: unknown; database?: string; save?: Record<string, string>; as?: string; name?: string };
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
    `select table_name, string_agg(column_name || ' ' || udt_name, ', ' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name in (${names.map((n) => `'${n}'`).join(",")}) group by 1 order by 1`,
    15000,
  );
  const lines = out.trim().split("\n").filter(Boolean).slice(0, 15);
  // ponytail: ic_trans มี 153 คอลัมน์ (~3.2k ตัวอักษรแบบ udt_name) — ตัดที่ 1500 เดิม AI เห็นแค่ 1 ใน 3 แล้วเดาชื่อ (2026-10-29 d.sum_value)
  const cols = lines.map((l) => l.replace("|", ": ").slice(0, 4000)).join("\n") || "(ไม่พบตารางเหล่านี้ในฐาน Demo)";
  // AI เดาเลข trans_flag ผิด (2026-10-29 ask-purchase-data ใช้ 4=ใบสั่งซื้อ 6=ใบรับ แต่โค้ดจริง 6=ใบสั่งซื้อ trans_grid.go:111) → ให้ชื่อจากฟังก์ชัน trans_flag() ของ SML เอง (คืนเป็น set ต้องห่อ select แบบ report_menu_cb.go:652)
  if (!cols.includes("trans_flag")) return cols;
  const flags = await psqlRead("select string_agg(f || '=' || coalesce((select trans_flag(f) limit 1)::text, '?'), ', ' order by f) from (select distinct trans_flag f from ic_trans) x", 15000).catch(() => "");
  return flags.trim() ? `${cols}\ntrans_flag ที่มีจริงใน ic_trans (เลข=ประเภทเอกสาร ใช้เลขนี้เท่านั้น ห้ามเดา): ${flags.trim().slice(0, 1500)}` : cols;
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
    "pick",
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

// {{x}} ต้องมาจากขั้นก่อนหน้า (save/as/set) ไม่งั้นตัวรันพัง "ไม่มีตัวแปร" — ล้อ fill() ใน runner/run.mjs ที่ข้ามคีย์ sql
// (2026-10-29 ask-purchase-data ขั้น 10 ใช้ {{total_recv_qty}} ในขั้นเดียวกับที่ select มันออกมา → รันพัง ไม่ได้ตรวจ ERP จึงไม่เปิด ticket)
function varGuard(sc: Script) {
  const known = new Set(["run.id", "run.short", "run.tag"]);
  for (const st of [...sc.steps, ...(sc.cleanup ?? [])]) {
    const rest = { ...st, sql: undefined };
    for (const [, k] of JSON.stringify(rest).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g))
      if (!known.has(k) && !k.startsWith("env.")) throw new Error(`ขั้น "${st.title}": ใช้ตัวแปร {{${k}}} ที่ไม่มีขั้นก่อนหน้า save ไว้ — save จากขั้นก่อน หรือเทียบกันในตัว SQL เลย`);
    for (const k of Object.keys(st.save ?? {})) known.add(k);
    if (st.as) known.add(st.as);
    if (st.do === "set" && st.name) known.add(st.name);
  }
}

// AI ยังเดาชื่อตาราง/คอลัมน์ได้ทั้งที่ให้คอลัมน์จริงไปแล้ว (2026-10-29 เดา ar_invoice → รันพัง → เปิด SMLAIACC-165 ทั้งที่ ERP ไม่ผิด)
// EXPLAIN แค่วางแผน ไม่รันจริง · ตัวแปร psql :'x' แทนด้วย NULL · จับเฉพาะตาราง/คอลัมน์ที่ไม่มีจริง ที่เหลือให้ตัวรันตัดสิน
async function sqlGuard(sc: Script) {
  for (const s of sc.steps) {
    if (s?.do !== "db.query" || s.database || typeof s.sql !== "string") continue;
    const sql = s.sql.replace(/(?<!:):(['"]?)[A-Za-z_]\w*\1/g, "NULL");
    const e = await psqlRead(`EXPLAIN ${sql}`).then(() => "", errText);
    const miss = e.match(/(relation|column) \S+ does not exist/);
    if (miss) throw new Error(`ขั้น "${s.title}": ${miss[0]} — ใช้เฉพาะตาราง/คอลัมน์ใน "คอลัมน์จริง"`);
  }
}

// ตัวตรวจที่สคริปต์ AI ทุกทางต้องผ่าน (✨ คำสั่ง และ MCP save_script)
export async function checkScript(sc: Script) {
  varGuard(sc);
  await sqlGuard(sc);
}

// ให้ AI เขียนสคริปต์ของบอทนี้ แล้วบันทึกผ่านตัวตรวจเดียวกับ MCP save_script (ผิดแล้วให้แก้อีก 1 รอบ)
async function writeScript(bot: BotConfig, id: string, command: string): Promise<Script> {
  const mine = loadScripts().scripts.filter((s) => s.module === bot.role && !s.ai);
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
    const prompt = `คำสั่ง: ${command}${err ? `\n\nสคริปต์รอบก่อนถูกปฏิเสธ: ${err} — แก้แล้วส่งใหม่` : ""}`;
    // รุ่นเขียนสคริปต์ช้า/หมดเวลาตอนสั่งหลายบอทพร้อมกัน (log 2026-10-29: 99-120 วิ, timeout จนบอทล้ม) → สลับใช้รุ่นเร็วแทน บอทไม่ล้มทั้งตัว
    const text = await askBrain("script", getSettings().scriptModel, system, prompt, [], SCRIPT_SCHEMA).catch(() =>
      askBrain("script-fallback", getSettings().brainModel, system, prompt, [], SCRIPT_SCHEMA),
    );
    try {
      const raw = json(text);
      const sc = (raw.steps ? raw : (Object.values(raw).find((v) => (v as Script)?.steps) ?? raw)) as Script; // บางครั้งโมเดลห่อไว้ใน {script:{...}}
      if (!Array.isArray(sc.steps) || !sc.steps.length) throw new Error("ไม่มีขั้นตอน (steps ว่าง)");
      readOnlyGuard(sc);
      await checkScript(sc);
      const severity = /^S[1-4]$/.test(String(sc.severityOnFail)) ? sc.severityOnFail : "S3";
      saveScript({ script: { ...sc, id, module: bot.role, lens: bot.lens, severityOnFail: severity, description: `${id.startsWith("auto-") ? "AI เสนอเอง" : "สั่งงาน"}: ${command}${raw.description ? ` · ${raw.description}` : ""}` } });
      return sc;
    } catch (e) {
      err = errText(e);
    }
  }
  throw new Error(`AI เขียนสคริปต์ไม่ผ่านการตรวจ: ${err}`);
}

// บอท 1 ตัวรับคำสั่ง → เขียนสคริปต์ ask-<โมดูล>-<มุม> → เข้าคิวรันจริง · บันทึกลงประวัติงานของบอท
// ponytail: id คงที่ต่อบอท (สั่งใหม่ = ทับของเดิม) กันไฟล์รก — ถ้าสั่งซ้ำขณะรอบเก่ายังรอคิว รอบนั้นจะรันสคริปต์ใหม่
export async function commandBot(botId: string, command: string, title?: string, scriptId?: string): Promise<BotConfig | null> {
  const bot = getBotById(botId);
  if (!bot) return null;
  const task: BotTask = { id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: title || command.slice(0, 40), kind: "agent", status: "running", startedAt: new Date().toISOString(), prompt: command };
  try {
    const id = scriptId ?? `ask-${bot.role}-${bot.lens}`;
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

// ลุงจืดสั่ง 2026-10-29: AI เห็นว่าควรทดสอบอะไรเพิ่ม ให้เขียนสคริปต์ใหม่เองได้เลย (on the fly) — เรียกตอนจบแต่ละชุดทดสอบ
// สคริปต์ auto-* ผ่านตัวตรวจเดียวกับ ask-* (อ่านอย่างเดียว + ตรวจ SQL) แล้วเข้าคิวรัน · ชุดที่มีแต่ auto-* ไม่เสนอต่อ จึงไม่วนไม่จบ
// ponytail: เพดาน AUTO_MAX ไฟล์ เต็มแล้วหยุดเสนอจนกว่าจะลบ/คัดเข้าคลัง — อยากให้หมุนเวียนค่อยเปลี่ยนเป็นลบตัวเก่าสุด
const AUTO_PER_BATCH = 2;
const AUTO_MAX = 30;
const PROPOSE_SCHEMA = {
  type: "object",
  properties: { ideas: { type: "array", items: { type: "object", properties: { botId: { type: "string" }, command: { type: "string" } }, required: ["botId", "command"] } } },
  required: ["ideas"],
};
let proposing = false;

export async function proposeScripts(runIds: string[]) {
  const done = runIds.map(getRun).filter((r): r is ScriptRun => r?.status === "passed" || r?.status === "failed");
  if (proposing || !getSettings().autoScripts || !done.some((r) => !r.scriptId.startsWith("auto-"))) return;
  const { scripts } = loadScripts();
  const room = Math.min(AUTO_PER_BATCH, AUTO_MAX - scripts.filter((s) => s.id.startsWith("auto-")).length);
  if (room <= 0) return;
  proposing = true;
  try {
    const bots = getBots();
    const results = done.map((r) => {
      const f = r.steps.find((s) => s.status === "failed");
      return `- [${r.status === "passed" ? "ผ่าน" : "ไม่ผ่าน"}] ${r.scriptTitle}${f ? ` · พังที่ขั้น "${f.title}": ${f.detail ?? ""}`.slice(0, 300) : ""}`;
    });
    const text = await askBrain(
      "propose",
      getSettings().brainModel,
      `คุณคือหัวหน้าทีม UAT ของ SML AI Account (ERP บัญชีไทย) ดูผลชุดทดสอบที่เพิ่งจบกับรายชื่อสคริปต์ที่มีแล้ว แล้วเสนอเรื่องที่ควรทดสอบเพิ่มไม่เกิน ${room} เรื่อง: ขุดต่อจากขั้นที่พังเพื่อหาต้นเหตุ หรือเรื่องที่น่าจะพังแต่ยังไม่มีสคริปต์ตรวจ (ยอดเงิน ภาษี สต๊อก GL มาก่อน) ห้ามซ้ำกับสคริปต์ที่มีแล้ว · แต่ละเรื่องเลือกบอทที่ตรงที่สุด 1 ตัว และเขียนคำสั่งภาษาไทย 1-2 ประโยคที่ชัดพอให้บอทเขียนสคริปต์ได้ · ไม่มีเรื่องที่คุ้มทดสอบให้ตอบ ideas ว่าง · ตอบ JSON เท่านั้น`,
      `ผลชุดทดสอบ:\n${results.join("\n").slice(0, 8000)}\n\nสคริปต์ที่มีแล้ว (id | ชื่อ):\n${scripts.map((s) => `${s.id} | ${s.title}`).join("\n")}\n\nบอท (id | ชื่อ | หน้าที่):\n${bots.map((b) => `${b.id} | ${b.name} | ${b.focus}`).join("\n")}`,
      [],
      PROPOSE_SCHEMA,
    );
    // ponytail: โมเดลไม่ยึดชื่อช่องใน schema (ทดสอบ 2026-10-29 ตอบ bot/instruction แทน botId/command) → รหัสบอทจาก bot-NN ในเรื่องนั้น, คำสั่ง = ข้อความยาวสุด
    const raw = json(text);
    const ideas: Record<string, unknown>[] = (Array.isArray(raw.ideas) ? raw.ideas : Object.values(raw).find(Array.isArray)) ?? [];
    for (const idea of ideas.slice(0, room)) {
      const bot = bots.find((b) => b.id === JSON.stringify(idea).match(/bot-\d{2}/)?.[0]);
      const command = Object.values(idea).filter((v): v is string => typeof v === "string").sort((a, b) => b.length - a.length)[0];
      if (!bot || !command) continue;
      const task = (await commandBot(bot.id, command, `AI เสนอ: ${command.slice(0, 30)}`, `auto-${bot.role}-${Date.now().toString(36)}`))?.taskHistory[0];
      const ok = task?.status === "completed";
      pushActivity({ kind: "note", text: `AI เสนอทดสอบเพิ่มเอง (${bot.name}): ${command} → ${ok ? `เขียน ${task.scriptId} แล้วเข้าคิวรัน` : (task?.result ?? "ไม่สำเร็จ")}`, scriptId: ok ? task.scriptId : undefined });
    }
  } catch (e) {
    pushActivity({ kind: "note", text: `AI คิดสคริปต์ทดสอบเพิ่มไม่สำเร็จ: ${errText(e)}` });
  } finally {
    proposing = false;
  }
}
