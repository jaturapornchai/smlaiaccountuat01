// ทดสอบ zero-touch ใน src/lib/uat-runs.ts: rerunStranded (รอบค้างไม่มี ticket → รันใหม่, auto-* ที่ยังพังเอง → ปลดออกจากคลัง)
// และตัวรันขัดข้อง → ลองใหม่เอง 1 ครั้ง (ตัวรันปลอมใน runner/run.mjs) — ไม่แตะ ERP: node scripts/check-rerun-stranded.mjs
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { posix } from "node:path";
import assert from "node:assert/strict";

const repo = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const join = posix.join; // ponytail: ทาง / ล้วน ให้ jiti alias บน Windows (ดู check-heal.mjs)
const T = mkdtempSync(join(tmpdir().replaceAll("\\", "/"), "check-stranded-"));
const put = (f, s) => (mkdirSync(join(T, f, ".."), { recursive: true }), writeFileSync(join(T, f), s));
put("mock/misc.mjs", "export const pushActivity = () => {}; export const redact = (s) => s; export const writeLog = () => {}; export const clearSent = () => []; export const commentIssue = async () => {}; export const reportRun = async () => {}; export const aiTriage = async () => undefined; export const scriptFault = () => undefined; export const recordRun = () => {}; export const proposeScripts = () => {};");
// maxParallelBots 0 = เข้าคิวอย่างเดียว ไม่ปล่อยตัวรัน (เปิดทีหลังตอนทดสอบลองใหม่)
put("mock/store.mjs", "export const settings = { autoIssueMate: true, maxParallelBots: 0, erpTargetUrl: 'x', headed: false }; export const getSettings = () => settings; const bot = { id: 'bot-gl-data', role: 'gl', lens: 'data', status: 'idle', stats: { runs: 0, passed: 0, failed: 0, stepsChecked: 0, lastActive: null }, taskHistory: [] }; export const getBots = () => [bot]; export const getBotById = () => bot; export const addEvent = () => {};");
// ตัวรันปลอม: จบแบบขัดข้องเหมือนเกินเวลารวม (runner/run.mjs ตัวจริงส่งข้อความเดียวกัน)
put("runner/run.mjs", `console.log(JSON.stringify({ t: "end", status: "error", message: "เกินเวลารวมของสคริปต์" }));`);
const ids = ["fail", "fail-then-pass", "sent", "reason", "sending", "error", "stopped", "auto-broken", "retry-me"];
for (const id of ids) put(`uat-scripts/${id}.json`, JSON.stringify({ id, title: id, module: "gl", lens: "data", steps: [{ do: "db.query", sql: "select 1" }] }));
const run = (id, scriptId, status, extra = {}, t = "2026-10-29T10:00:00.000Z") => put(`runs/${id}/run.json`, JSON.stringify({ id, scriptId, status, queuedAt: t, steps: [], botId: "bot-gl-data", ...extra }));
run("R1", "fail", "failed"); // ค้าง → รันใหม่
run("R2", "fail-then-pass", "failed");
run("R3", "fail-then-pass", "passed", {}, "2026-10-29T11:00:00.000Z"); // รอบล่าสุดผ่านแล้ว → ไม่ยุ่ง
run("R4", "sent", "failed", { issue: { status: "sent", code: "SMLAIACC-1" } });
run("R5", "reason", "failed", { noIssue: "สคริปต์พังเอง ยังไม่ได้ตรวจ ERP" }); // สคริปต์ที่คนเขียน → คงไว้ ไม่ปลด
run("R6", "sending", "failed", { issue: { status: "sending" } }); // รีสตาร์ตระหว่างส่ง → โหลดเป็น error → รันใหม่
run("R7", "error", "error"); // ตัวรันขัดข้อง → รันใหม่
run("R8", "stopped", "stopped"); // คนสั่งหยุด → ไม่ยุ่ง
run("R9", "auto-broken", "failed", { noIssue: "สคริปต์ที่ AI ซ่อมยังพังเอง ไม่บันทึกทับ: x", healOf: "R0" }); // auto-* ที่ AI ซ่อมไม่ได้ → ปลด
process.chdir(T);

const m = (f) => join(T, "mock", f);
const req = createRequire(join(repo, "package.json"));
const jiti = createRequire(req.resolve("tailwindcss"))("jiti")(join(repo, "src/lib/x.ts"), {
  alias: { "@": join(repo, "src"), "./activity": m("misc.mjs"), "./log": m("misc.mjs"), "./issuemate": m("misc.mjs"), "./script-fault": m("misc.mjs"), "./run-history": m("misc.mjs"), "./command": m("misc.mjs"), "./swarm-store": m("store.mjs") },
});
const runs = jiti(join(repo, "src/lib/uat-runs.ts"));
const store = jiti(m("store.mjs"));

store.settings.autoIssueMate = false;
assert.deepEqual(runs.rerunStranded(), { rerun: [], retired: [] }); // ปิดส่ง IssueMate อัตโนมัติ → ไม่แตะอะไร
store.settings.autoIssueMate = true;
const T0 = new Date().toISOString();
const swept = runs.rerunStranded();
assert.deepEqual(swept.rerun.sort(), ["error", "fail", "sending"]);
assert.deepEqual(swept.retired, ["auto-broken"]);
assert.ok(existsSync("uat-scripts/retired/auto-broken.json") && !existsSync("uat-scripts/auto-broken.json"));
assert.ok(existsSync("uat-scripts/reason.json")); // ไม่ใช่ auto-* → ไม่ปลด
const r9 = JSON.parse(readFileSync("runs/R9/run.json", "utf8"));
assert.ok(r9.retired && /ปลดสคริปต์ออกจากคลังแล้ว/.test(r9.noIssue));
assert.equal(runs.activeRunCount(), 3);
assert.deepEqual(runs.rerunStranded(), { rerun: [], retired: [] }); // เรียกซ้ำไม่เข้าคิวซ้อน ไม่ปลดซ้ำ

// ตัวรันขัดข้อง → ลองใหม่เอง 1 ครั้งแล้วหยุด (ไม่วนไม่จบ)
runs.startRuns(["retry-me"]);
store.settings.maxParallelBots = 2;
runs.startRuns([]); // ปลุกคิว
for (let i = 0; i < 200 && runs.activeRunCount(); i++) await new Promise((r) => setTimeout(r, 100));
assert.equal(runs.activeRunCount(), 0);
const fresh = runs.listRuns(Infinity).filter((r) => r.queuedAt >= T0);
for (const id of ["error", "fail", "sending", "retry-me"]) {
  const mine = fresh.filter((r) => r.scriptId === id);
  const first = mine.find((r) => !r.retryOf), again = mine.find((r) => r.retryOf);
  assert.equal(mine.length, 2, `${id}: รันครั้งแรก + ลองใหม่ 1 ครั้ง`);
  assert.ok(first && again && again.retryOf === first.id && again.status === "error" && again.message === "เกินเวลารวมของสคริปต์", id);
}
console.log("ผ่าน: รอบค้างไม่มี ticket/เหตุผล → รันใหม่, auto-* ที่ยังพังเอง → ปลดออกจากคลัง (สคริปต์คนเขียนคงไว้), ปิดส่งอัตโนมัติไม่แตะ, ไม่เข้าคิวซ้อน, ตัวรันขัดข้อง → ลองใหม่ 1 ครั้งแล้วหยุด");
process.chdir(repo);
rmSync(T, { recursive: true, force: true });
