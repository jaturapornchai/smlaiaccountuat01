// ทดสอบ rerunStranded (src/lib/uat-runs.ts): รอบล่าสุดที่ไม่ผ่านแต่ไม่มี ticket/เหตุผล → รันใหม่เอง — จำลองทุกอย่างรอบตัว ไม่แตะ ERP: node scripts/check-rerun-stranded.mjs
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { posix } from "node:path";
import assert from "node:assert/strict";

const repo = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const join = posix.join; // ponytail: ทาง / ล้วน ให้ jiti alias บน Windows (ดู check-heal.mjs)
const T = mkdtempSync(join(tmpdir().replaceAll("\\", "/"), "check-stranded-"));
const put = (f, s) => (mkdirSync(join(T, f, ".."), { recursive: true }), writeFileSync(join(T, f), s));
put("mock/misc.mjs", "export const pushActivity = () => {}; export const redact = (s) => s; export const writeLog = () => {}; export const clearSent = () => []; export const commentIssue = async () => {}; export const reportRun = async () => {}; export const aiTriage = async () => undefined; export const scriptFault = () => undefined; export const recordRun = () => {};");
// maxParallelBots 0 = เข้าคิวอย่างเดียว ไม่ปล่อยตัวรันจริง
put("mock/store.mjs", "export const settings = { autoIssueMate: true, maxParallelBots: 0, erpTargetUrl: 'x', headed: false }; export const getSettings = () => settings; export const getBots = () => [{ id: 'bot-1', role: 'gl', lens: 'data' }]; export const getBotById = () => null; export const addEvent = () => {};");
const ids = ["fail", "fail-then-pass", "sent", "reason", "sending", "error", "stopped"];
put("mock/scripts.mjs", `export const loadScripts = () => ({ scripts: ${JSON.stringify(ids)}.map((id) => ({ id, title: id, module: 'gl', lens: 'data', severityOnFail: 'S1', ai: true, steps: [] })), errors: [] });`);
const run = (id, scriptId, status, extra = {}, t = "2026-10-29T10:00:00.000Z") => put(`runs/${id}/run.json`, JSON.stringify({ id, scriptId, status, queuedAt: t, steps: [], ...extra }));
run("R1", "fail", "failed"); // ค้าง → รันใหม่
run("R2", "fail-then-pass", "failed");
run("R3", "fail-then-pass", "passed", {}, "2026-10-29T11:00:00.000Z"); // รอบล่าสุดผ่านแล้ว → ไม่ยุ่ง
run("R4", "sent", "failed", { issue: { status: "sent", code: "SMLAIACC-1" } });
run("R5", "reason", "failed", { noIssue: "สคริปต์พังเอง ยังไม่ได้ตรวจ ERP" }); // กฎ/AI ตัดสินแล้ว → ไม่ยุ่ง
run("R6", "sending", "failed", { issue: { status: "sending" } }); // รีสตาร์ตระหว่างส่ง → โหลดเป็น error → รันใหม่
run("R7", "error", "error"); // ตัวรันขัดข้อง → รันใหม่
run("R8", "stopped", "stopped"); // คนสั่งหยุด → ไม่ยุ่ง
process.chdir(T);

const m = (f) => join(T, "mock", f);
const req = createRequire(join(repo, "package.json"));
const jiti = createRequire(req.resolve("tailwindcss"))("jiti")(join(repo, "src/lib/x.ts"), {
  alias: { "@": join(repo, "src"), "./activity": m("misc.mjs"), "./log": m("misc.mjs"), "./issuemate": m("misc.mjs"), "./script-fault": m("misc.mjs"), "./run-history": m("misc.mjs"), "./swarm-store": m("store.mjs"), "./uat-scripts": m("scripts.mjs") },
});
const runs = jiti(join(repo, "src/lib/uat-runs.ts"));
const store = jiti(m("store.mjs"));

store.settings.autoIssueMate = false;
assert.deepEqual(runs.rerunStranded(), []); // ปิดส่ง IssueMate อัตโนมัติ → ไม่รันใหม่
store.settings.autoIssueMate = true;
assert.deepEqual(runs.rerunStranded().sort(), ["error", "fail", "sending"]);
assert.equal(runs.activeRunCount(), 3);
assert.deepEqual(runs.rerunStranded(), []); // รอบใหม่ที่เข้าคิวกลายเป็นรอบล่าสุด → เรียกซ้ำไม่เข้าคิวซ้อน
console.log("ผ่าน: รันใหม่เฉพาะรอบล่าสุดที่ไม่ผ่าน/ขัดข้องโดยไม่มี ticket หรือเหตุผล, ไม่ยุ่งรอบที่ผ่าน/มี ticket/มีเหตุผล/คนหยุด, ปิดส่งอัตโนมัติไม่รัน, ไม่เข้าคิวซ้อน");
process.chdir(repo);
rmSync(T, { recursive: true, force: true });
