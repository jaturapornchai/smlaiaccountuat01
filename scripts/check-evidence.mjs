// ทดสอบกฎกลาง "ห้ามเดา ห้ามแต่งเติม ตรวจตามระบบของ SML AI Account" (runner/evidence-rule.mjs) โดยจำลอง fetch/สมอง AI — ไม่แตะ ERP/IssueMate จริง: node scripts/check-evidence.mjs
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { posix } from "node:path";
import assert from "node:assert/strict";
import { EVIDENCE_RULE } from "../runner/evidence-rule.mjs";

const repo = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const join = posix.join; // ponytail: ทาง / ล้วน ให้ jiti alias บน Windows (ดู check-heal.mjs)
const T = mkdtempSync(join(tmpdir().replaceAll("\\", "/"), "check-evidence-"));
const put = (f, s) => (mkdirSync(join(T, f, ".."), { recursive: true }), writeFileSync(join(T, f), s));
put("mock/log.mjs", "export const timed = (n, d, f) => f(0); export const writeLog = () => {};");
put("mock/brain.mjs", "export const calls = []; let reply = () => '{}'; export const setReply = (f) => { reply = f; }; export async function askBrain(job, model, system, prompt) { calls.push({ job, system, prompt }); return reply(job); } export async function webResearch() { return ''; } export const checkSources = (text) => ({ text, dropped: [] });");
put("mock/store.mjs", "export const settings = { autoIssueMate: true, brainModel: 'b', erpTargetUrl: 'https://sml.test/' }; export const getSettings = () => settings;");
put("mock/sml.mjs", "export let ctx = ''; export const setCtx = (s) => { ctx = s; }; export const smlContext = async () => ctx;");
put("mock/issuemate.mjs", "export const asked = []; export async function requestMcp(need, task, existing) { asked.push({ need, existing }); return need ? `ขอ ${need.name} แล้ว (SMLAIACC-9)` : ''; }");
put("mock/misc.mjs", "export const isAiScript = (id) => /^(ask|auto)-/.test(id); export const SCRIPT_DIR = process.cwd() + '/uat-scripts';");
mkdirSync(join(T, "runs"), { recursive: true });
process.chdir(T);

// fetch ปลอม: จำคำขอทุกครั้ง ตอบตาม URL/เมธอด
const sent = [];
let issueNo = 100;
globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : undefined;
  sent.push({ url: String(url), body, auth: init.headers?.Authorization });
  const ok = (j) => ({ ok: true, status: 200, json: async () => j });
  if (String(url).includes("ollama")) return ok({ message: { content: "ตอบ" } });
  if (String(url).includes("issuemate")) return ok({ result: { content: [{ text: JSON.stringify({ status: "created", issue: { code: `SMLAIACC-${++issueNo}` } }) }] } });
  if (body?.method === "tools/list") return ok({ result: { tools: [{ name: "sml_list_tables", description: "ตาราง", inputSchema: {} }] } });
  if (body?.method === "tools/call") return ok({ result: { content: [{ text: `ผลของ ${body.params.name}` }] } });
  throw new Error(`ไม่คาดว่าจะเรียก ${url}`);
};

const m = (f) => join(T, "mock", f);
const req = createRequire(join(repo, "package.json"));
// ponytail: jiti ตัวเดียว — โมดูลจริงที่ทดสอบโหลดด้วยทางเต็ม ส่วนที่มันเรียกต่อชี้ไปตัวปลอม
const jiti = createRequire(req.resolve("tailwindcss"))("jiti")(join(repo, "src/lib/x.ts"), {
  alias: { "@": join(repo, "src"), "./log": m("log.mjs"), "./brain": m("brain.mjs"), "./swarm-store": m("store.mjs"), "./sml-mcp": m("sml.mjs"), "./issuemate": m("issuemate.mjs"), "./uat-scripts": m("misc.mjs") },
});

// 1) askBrain ต่อกฎกลางท้าย system prompt ทุกงาน · ตัวรันใช้กฎเดียวกัน
process.env.OLLAMA_API_URL = "https://ollama.test";
process.env.OLLAMA_API_KEY = "fake";
const brain = jiti(join(repo, "src/lib/brain.ts"));
assert.equal(await brain.askBrain("t", "m", "งานทดสอบ", "p"), "ตอบ");
assert.equal(sent.at(-1).body.messages[0].content, `งานทดสอบ\n\n${EVIDENCE_RULE}`);
assert.match(readFileSync(join(repo, "runner/run.mjs"), "utf8"), /messages\[0\]\.content\}\\n\\n\$\{EVIDENCE_RULE\}/);

// 2) checkSources: URL ที่ไม่มีในแหล่งอ้างอิงถูกตัด ที่มีจริงคงไว้ (รวมท้ายประโยค/ทับท้าย)
const src = "- ภาษี — https://www.rd.go.th/vat.html\n  เนื้อหา";
const r = brain.checkSources("ดู https://www.rd.go.th/vat.html. และ https://fake.example/law ด้วย", src);
assert.deepEqual(r.dropped, ["https://fake.example/law"]);
assert.equal(r.text, "ดู https://www.rd.go.th/vat.html. และ (ตัด URL ที่ไม่มีในแหล่งอ้างอิง) ด้วย");
assert.equal(brain.checkSources("ไม่มีลิงก์", "").dropped.length, 0);

// 3) คัดรอบพัง: ชี้ว่าสคริปต์ผิดได้เฉพาะเมื่อคัดหลักฐานที่มีจริง
put("uat-scripts/ask-x.json", JSON.stringify({ title: "x", steps: [{ title: "ดูยอด", do: "db.query", sql: "select 1" }] }));
const mb = jiti(m("brain.mjs"));
const sf = jiti(join(repo, "src/lib/script-fault.ts"));
const run = { scriptId: "ask-x", scriptTitle: "x", passed: 0, failed: 1, steps: [{ i: 0, title: "ดูยอด", kind: "ui.read", status: "failed", detail: "ไม่พบช่อง ยอดรวมสุทธิ ในหน้าจอ", expected: "100", actual: "" }] };
const triage = (evidence) => (mb.setReply(() => JSON.stringify({ verdict: "SCRIPT_FAULT", reason: "selector ผิด", evidence })), sf.aiTriage(run, T, "a"));
assert.equal(await triage("ช่องยอดหายไปเพราะระบบเปลี่ยนชื่อ"), undefined); // แต่งหลักฐานเอง → เปิด issue ตามเดิม
assert.equal(await triage(""), undefined);
assert.match(await triage("ไม่พบช่อง  ยอดรวมสุทธิ\nในหน้าจอ"), /^selector ผิด \(หลักฐาน: ไม่พบช่อง ยอดรวมสุทธิ ในหน้าจอ\)$/); // คัดตรงตัว (ช่องว่างต่างได้)
const sml = jiti(m("sml.mjs"));
sml.setCtx("ข้อมูลจาก MCP ของ SML AI Account: ยอดรวมสุทธิแสดงเฉพาะเอกสารที่อนุมัติแล้ว");
assert.match(await triage("ยอดรวมสุทธิแสดงเฉพาะเอกสารที่อนุมัติแล้ว"), /^selector ผิด/); // หลักฐานจาก MCP ของ SML ใช้ได้
assert.match(mb.calls.at(-1).prompt, /ข้อมูลจาก MCP ของ SML AI Account/);

// 4) smlContext: เรียกเฉพาะเครื่องมือที่มีจริง · ขาดเครื่องมือ → requestMcp · ไม่มี token = ไม่ทำอะไร
const ctx = jiti(join(repo, "src/lib/sml-mcp.ts"));
const im = jiti(m("issuemate.mjs"));
delete process.env.SML_MCP_TOKEN;
let n = sent.length;
assert.equal(await ctx.smlContext("งานไม่มี token"), "");
assert.equal(sent.length, n);
process.env.SML_MCP_TOKEN = "smlmcp_ro_fake";
const need = { name: "sml_document_workflow", why: "ต้องรู้ลำดับสถานะเอกสาร", input: "ประเภทเอกสาร", output: "ลำดับสถานะและเงื่อนไขอนุมัติ" };
mb.setReply(() => JSON.stringify({ calls: [{ tool: "sml_list_tables", args: {} }, { tool: "sml_made_up", args: {} }], needMcp: need }));
const out = await ctx.smlContext("ตรวจ workflow ใบสั่งซื้อ");
const mcpCalls = sent.slice(n).filter((s) => s.body?.method);
assert.deepEqual(mcpCalls.map((s) => s.body.method === "tools/call" ? s.body.params.name : s.body.method), ["tools/list", "sml_list_tables"]); // ชื่อที่ AI แต่ง ไม่เรียก
assert.equal(mcpCalls[0].url, "https://sml.test/api/mcp");
assert.equal(mcpCalls[0].auth, "Bearer smlmcp_ro_fake");
assert.match(out, /ผลของ sml_list_tables/);
assert.match(out, /ขอ sml_document_workflow แล้ว \(SMLAIACC-9\)/);
assert.deepEqual(im.asked.at(-1), { need, existing: ["sml_list_tables"] });
n = sent.length;
await ctx.smlContext("ตรวจ workflow ใบสั่งซื้อ");
assert.equal(sent.length, n); // งานเดิม → ใช้ผลแคช ไม่วางแผน/เรียกซ้ำ

// 5) requestMcp: ตรวจชื่อ/รายละเอียด · เปิด ticket feature ครั้งเดียวต่อชื่อ · เพดาน 3 ใบต่อวัน · ปิดส่งอัตโนมัติ = ไม่เปิด
process.env.ISSUEMATE_MCP_URL = "https://issuemate.test/api/mcp";
process.env.ISSUEMATE_TOKEN = "fake";
const st = jiti(m("store.mjs"));
const iss = jiti(join(repo, "src/lib/issuemate.ts"));
const ask = (name) => iss.requestMcp({ ...need, name }, "ตรวจ workflow ใบสั่งซื้อ", ["sml_list_tables"]);
const tickets = () => sent.filter((s) => s.body?.params?.name === "create_issue");
assert.equal(await ask("list_tables"), ""); // ไม่ขึ้นต้น sml_
assert.equal(await ask("sml_list_tables"), ""); // มีอยู่แล้ว
assert.equal(await iss.requestMcp({ ...need, why: "สั้น" }, "t", []), ""); // รายละเอียดไม่พอ
st.settings.autoIssueMate = false;
assert.equal(await ask("sml_off"), "");
st.settings.autoIssueMate = true;
assert.equal(tickets().length, 0);
assert.match(await ask("sml_document_workflow"), /SMLAIACC-101/);
const t = tickets()[0].body.params.arguments;
assert.equal(t.type, "feature");
assert.deepEqual(t.labels, ["uat", "mcp-request"]);
assert.match(t.title, /^\[UAT ขอ MCP\] sml_document_workflow — /);
assert.ok(!t.description.includes("uat-scripts/")); // listDeployed ค้นคำนี้ — ห้ามปน
assert.match(await ask("sml_document_workflow"), /SMLAIACC-101/); // ซ้ำ → ไม่เปิดใหม่
assert.equal(tickets().length, 1);
await ask("sml_tax_rules");
await ask("sml_stock_flow");
assert.equal(await ask("sml_fourth_today"), ""); // ครบ 3 ใบวันนี้
assert.equal(tickets().length, 3);
assert.ok(existsSync("runs/mcp-requests.json") && !existsSync("runs/issuemate-sent.json")); // กันซ้ำแยกจาก ticket บั๊ก

console.log("ผ่าน: กฎกลางต่อท้ายทุกงาน AI, ตัด URL ที่แต่ง, คัดรอบพังต้องคัดหลักฐานจริง (รวม MCP ของ SML), ดึงข้อมูลจาก MCP ของ SML เฉพาะเครื่องมือจริง, ขอ MCP เพิ่มผ่าน IssueMate ครั้งเดียวต่อชื่อ ≤3 ใบ/วัน");
process.chdir(repo);
rmSync(T, { recursive: true, force: true });
