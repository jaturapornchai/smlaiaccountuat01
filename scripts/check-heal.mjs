// ทดสอบ AI ซ่อมสคริปต์ (healScript/promoteHeal ใน src/lib/command.ts) โดยจำลองสมอง AI/psql/คิวรัน — ไม่แตะ ERP/ฐาน: node scripts/check-heal.mjs
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { posix } from "node:path";
import assert from "node:assert/strict";

const repo = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
// ponytail: ทาง / ล้วน — jiti ฝังทาง alias ลงโค้ดที่แปลงแล้ว ตัว \ ของ Windows ทำให้ parse พัง
const join = posix.join;
const T = mkdtempSync(join(tmpdir().replaceAll("\\", "/"), "check-heal-"));
const put = (f, s) => (mkdirSync(join(T, f, ".."), { recursive: true }), writeFileSync(join(T, f), s));
put("mock/activity.mjs", "export const log = []; export const pushActivity = (a) => log.push(a.text); export const waitActivity = () => {}; export const waitAny = () => {}; export const writeLog = () => {};");
put("mock/brain.mjs", "export const calls = []; let reply = () => '{}'; export const setReply = (f) => { reply = f; }; export async function askBrain(job, model, system, prompt) { calls.push({ job, system, prompt }); return reply(); } export async function webResearch() { return ''; }");
put("mock/store.mjs", "export const getSettings = () => ({ scriptModel: 's', brainModel: 'b' }); export const getBots = () => []; export const getBotById = () => null; export const addEvent = () => {}; export const updateSettings = () => {};");
put("mock/health.mjs", "export async function psqlRead(sql) { return sql.startsWith('EXPLAIN') ? '' : 'pr_trans|doc_no varchar'; } export const checkAll = () => {};");
put("mock/runs.mjs", "import { join } from 'node:path'; export const RUN_DIR = join(process.cwd(), 'runs'); export const started = []; export function startRuns(ids, retestOf, healOf) { started.push({ ids, retestOf, healOf }); return { runs: [{ id: 'TRIAL1' }], unknown: [] }; } export const getRun = () => undefined; export const retired = []; export const retireRun = (r) => (retired.push(r.scriptId), false); export const activeRunCount = () => 0; export const listRuns = () => []; export const sendToIssueMate = () => {}; export const stopRun = () => {};");
put("mock/misc.mjs", "export const scriptsForIssue = () => []; export const logDays = () => []; export const readLogs = () => []; export const timed = (n, f) => f; export const testDb = () => ''; export const writeLog = () => {};");
const script = (id, steps) => JSON.stringify({ id, title: "ตรวจยอดใบสั่งซื้อ", module: "purchase", lens: "data", severityOnFail: "S3", description: "สั่งงาน: ตรวจ", steps, cleanup: [] });
put("uat-scripts/ask-heal.json", script("ask-heal", [{ title: "นับใบสั่งซื้อ", do: "db.query", sql: "select count(*) as n from pr_trans where doc_kode = 'x'", expect: [{ col: "n", op: "eq", value: 0 }] }]));
put("uat-scripts/ask-writes.json", script("ask-writes", [{ title: "ลบ", do: "db.exec", sql: "delete from x where code like 'UAT%'" }]));
for (const r of ["R1", "R2", "R3"]) mkdirSync(join(T, "runs", r), { recursive: true });
process.chdir(T);

const m = (f) => join(T, "mock", f);
const req = createRequire(join(repo, "package.json"));
const jiti = createRequire(req.resolve("tailwindcss"))("jiti")(join(repo, "src/lib/x.ts"), {
  alias: { "@": join(repo, "src"), "./activity": m("activity.mjs"), "./brain": m("brain.mjs"), "./swarm-store": m("store.mjs"), "./uat-health": m("health.mjs"), "./uat-runs": m("runs.mjs"), "./issuemate": m("misc.mjs"), "./log": m("misc.mjs"), "./test-db": m("misc.mjs") },
});
const cmd = jiti(join(repo, "src/lib/command.ts"));
const brain = jiti(m("brain.mjs")), runs = jiti(m("runs.mjs")), act = jiti(m("activity.mjs"));
const run = (id, scriptId) => ({ id, scriptId, scriptTitle: "ตรวจยอดใบสั่งซื้อ", ai: true, steps: [{ i: 0, title: "นับใบสั่งซื้อ", kind: "db.query", cleanup: false, status: "failed", detail: "psql ผิดพลาด: column doc_kode does not exist" }] });
const fixed = { title: "ตรวจยอดใบสั่งซื้อ", steps: [{ title: "นับใบสั่งซื้อ", do: "db.query", sql: "select count(*) as n from pr_trans where doc_no = 'x'", expect: [{ col: "n", op: "eq", value: 0 }] }] };

// 1) อ่านอย่างเดียวพังเอง → heal.json + รอบลอง healOf · คลังยังเดิม
brain.setReply(() => "```json\n" + JSON.stringify(fixed) + "\n```");
assert.equal(await cmd.healScript(run("R1", "ask-heal"), "psql ผิดพลาด"), "TRIAL1");
assert.deepEqual(runs.started.at(-1), { ids: ["ask-heal"], retestOf: undefined, healOf: "R1" });
assert.deepEqual(runs.retired, []); // ซ่อมสำเร็จ → ไม่ปลดสคริปต์
assert.match(JSON.parse(readFileSync("runs/R1/heal.json", "utf8")).steps[0].sql, /doc_no/);
assert.match(readFileSync("uat-scripts/ask-heal.json", "utf8"), /doc_kode/);
assert.match(brain.calls.at(-1).system, /การออกแบบของ SML/);
// 2) ฉบับซ่อมแอบเขียนข้อมูล → ปฏิเสธ ไม่ลอง
const n = runs.started.length;
brain.setReply(() => JSON.stringify({ title: "x", steps: [{ title: "แก้", do: "db.exec", sql: "update x set y = 1" }] }));
assert.equal(await cmd.healScript(run("R2", "ask-heal"), "x"), undefined);
assert.equal(runs.started.length, n);
assert.ok(!existsSync("runs/R2/heal.json"));
assert.deepEqual(runs.retired, ["ask-heal"]); // ซ่อมไม่ได้ → ส่งให้ retireRun ตัดสิน (ปลดเฉพาะ auto-*)
// 3) สคริปต์เดิมมีขั้นเขียนข้อมูล → ไม่ซ่อม ไม่เรียกสมอง
const c = brain.calls.length;
assert.equal(await cmd.healScript(run("R3", "ask-writes"), "x"), undefined);
assert.equal(brain.calls.length, c);
assert.deepEqual(runs.retired, ["ask-heal", "ask-writes"]);
// 4) รอบลองผ่าน → บันทึกทับคลัง
cmd.promoteHeal({ id: "TRIAL1", healOf: "R1", scriptId: "ask-heal", status: "passed" });
const lib = JSON.parse(readFileSync("uat-scripts/ask-heal.json", "utf8"));
assert.match(lib.steps[0].sql, /doc_no/);
assert.match(lib.description, /AI ซ่อมจากรอบ R1 ลองแล้วรอบ TRIAL1/);
console.log("ผ่าน: ซ่อม→ลองก่อนบันทึก, ฉบับซ่อมที่เขียนข้อมูลถูกปฏิเสธ, สคริปต์ที่เขียนข้อมูลไม่ซ่อม, รอบลองผ่าน→บันทึกทับ");
process.chdir(repo);
rmSync(T, { recursive: true, force: true });
