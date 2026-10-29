// ตัวตรวจในเครื่องของ runner/run.mjs — ไม่แตะ uat.smlwork.com / SML: เปิดหน้า HTML ในเครื่องที่จงใจเหลื่อม แล้วดูว่าข้อค้นพบตรงไหม
// รัน: node runner/selfcheck.mjs  (ใช้ Playwright ตัวเดียวกับตัวรันจริง: UAT_PLAYWRIGHT หรือ D:/smlaiaccount/tests/playwright)
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const RUNNER = fileURLToPath(new URL("run.mjs", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "uat-selfcheck-"));

const row = (id, inner) => `<div class="row" id="${id}">${inner}</div>`;
const ALIGN = `<!doctype html><meta charset="utf-8"><style>body{font:14px sans-serif;margin:20px}.row{display:flex;align-items:center;gap:12px;margin:18px 0}input{height:36px;box-sizing:border-box}</style>
${row("a", "<label>ตรงกัน A</label><input>")}
${row("b", '<label style="position:relative;top:2px">เหลื่อม B</label><input>')}
${row("c", '<input type="checkbox"><div style="display:flex;flex-direction:column"><span>ชื่อ C</span><span>อีเมล C</span></div>')}
${row("d", '<label>รหัส D : <span style="color:red">*</span></label><input>')}
${row("e", '<button style="display:flex;align-items:center;gap:4px;height:32px"><svg width="16" height="16" style="position:relative;top:2px"><rect width="16" height="16"/></svg>ปุ่ม E</button><input>')}`;

// ข้อ 3: หน้าที่เปลี่ยนได้ระหว่างรอบ — look.n = เลขเอกสาร/วันที่/ค่าในช่อง (เปลี่ยนทุกรอบ ต้องไม่นับ), look.moved = เลื่อนกล่อง (หน้าตาเปลี่ยนจริง)
const look = { n: 98765, moved: false };
const VISUAL = () => `<!doctype html><meta charset="utf-8"><style>body{font:16px sans-serif;margin:20px}</style><h1>เทียบภาพ</h1>
<p>เลขที่ INV-${look.n} วันที่ 2026-10-${String((look.n % 28) + 1).padStart(2, "0")}</p><input value="${look.n}">
<div style="width:300px;height:120px;margin:20px 0 0 ${look.moved ? 260 : 20}px;background:#36c"></div><p>ข้อความคงที่</p>`;

const pages = { "/align.html": () => ALIGN, "/visual.html": VISUAL };
const server = createServer((req, res) => {
  const page = pages[req.url];
  res.writeHead(page ? 200 : 204, { "Content-Type": "text/html; charset=utf-8" }).end(page ? page() : "");
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;

let n = 0;
async function run(id, steps) {
  const file = join(tmp, `${id}.json`);
  writeFileSync(file, JSON.stringify({ id, title: id, steps, timeoutMs: 90_000 }));
  const out = join(tmp, `run${++n}`);
  const { stdout } = await promisify(execFile)(process.execPath, [RUNNER, "--script", file, "--out", out, "--base", base], { env: { ...process.env, UAT_BASELINE_DIR: join(tmp, "baselines") }, maxBuffer: 1 << 24 });
  const ev = stdout.trim().split("\n").map((l) => JSON.parse(l));
  const steps_ = {};
  for (const e of ev.filter((e) => e.t === "step")) steps_[e.i] = { ...steps_[e.i], ...e };
  return { out, end: ev.find((e) => e.t === "end"), steps: steps_ };
}

try {
  // ข้อ 2: เหลื่อม 2px (B: label, E: ไอคอนในปุ่ม) ต้องเจอ · ตรงกัน (A), ซ้อนบน-ล่าง (C), ดอกจันในบรรทัดเดียวกัน (D) ต้องไม่แจ้ง
  // ข้อความที่จัดตรงแล้วยังห่างกึ่งกลางช่องกรอก ~0.5px ตามเมตริกฟอนต์ → เลื่อน 2px วัดได้ 2–2.5px (เลื่อน 1px วัดได้ ~1.5px ก็ถูกแจ้งเช่นกัน)
  const r = await run("align", [{ title: "เปิดหน้า", do: "ui.goto", url: "/align.html" }, { title: "ตรวจ", do: "ui.expectClean" }, { title: "ตรวจซ้ำ (ไม่แจ้งแถวเดิม)", do: "ui.expectClean" }]);
  assert.equal(r.end.status, "passed", `ข้อค้นพบ S4 ต้องไม่ทำให้รอบล้ม: ${JSON.stringify(Object.values(r.steps).filter((s) => s.status !== "passed"))}`);
  const f = r.steps[1].findings ?? [];
  assert.equal(f.length, 1, "ต้องได้ข้อค้นพบ 1 ข้อ (รวมทุกแถวของหน้าจอนี้)");
  assert.equal(f[0].severity, "S4");
  assert.match(f[0].text, /ระนาบเหลื่อม 2 แถว/);
  assert.match(f[0].text, /"เหลื่อม B" \(x \d+\) ต่ำกว่า 2\.[05]px/);
  assert.match(f[0].text, /svg \(x \d+\) ต่ำกว่า 2\.0px/);
  assert.doesNotMatch(f[0].text, /ตรงกัน A|ชื่อ C|อีเมล C|รหัส D/);
  assert.match(f[0].evidence, /-align\.png$/);
  assert.equal(r.steps[2].findings, undefined, "แถวเดิมไม่แจ้งซ้ำในรอบเดียวกัน");
  console.log("ok  ระนาบ baseline:", f[0].text);

  // ข้อ 3: ภาพอ้างอิง = รอบล่าสุดที่ผ่าน · ตัวเลข/วันที่เปลี่ยน (ทั้งยาวขึ้นและสั้นลง) ไม่แจ้ง · หน้าตาเปลี่ยนแจ้งพร้อมภาพ diff · รอบไม่ผ่านไม่เขียนทับภาพอ้างอิง
  const vis = (fail) => [{ title: "เปิดหน้า", do: "ui.goto", url: "/visual.html" }, { title: "ถ่ายภาพ", do: "ui.screenshot", name: "page" }, ...(fail ? [{ title: "ล้มตั้งใจ", do: "ui.expectText", selector: "h1", text: "ไม่มีข้อความนี้", timeout: 500 }] : [])];
  const ref = join(tmp, "baselines", "visual", "page.png");
  let v = await run("visual", vis());
  assert.equal(v.end.status, "passed");
  assert.equal(v.steps[1].findings, undefined);
  assert.match(v.steps[1].detail, /ภาพแรก/);
  assert.ok(existsSync(ref), "รอบผ่านต้องเก็บภาพอ้างอิง");
  look.n = 1; // เลขสั้นลง: ตัวเลขในภาพเก่ายาวกว่า ต้องถูกปิดจาก masks ของภาพอ้างอิงด้วย
  v = await run("visual", vis());
  assert.equal(v.steps[1].findings, undefined, `ตัวเลข/วันที่เปลี่ยนต้องไม่แจ้ง: ${v.steps[1].detail}`);
  assert.match(v.steps[1].detail, /ต่างจากรอบล่าสุดที่ผ่าน 0\.00%/);
  console.log("ok  ตัวเลข/วันที่เปลี่ยน:", v.steps[1].detail);
  look.n = 4242; look.moved = true;
  v = await run("visual", vis());
  const vf = v.steps[1].findings ?? [];
  assert.equal(vf.length, 1, "หน้าตาเปลี่ยนต้องได้ข้อค้นพบ");
  assert.equal(vf[0].kind, "visual");
  assert.match(vf[0].evidence, /-diff-page\.png$/);
  assert.ok(existsSync(join(v.out, vf[0].evidence)), "ต้องมีไฟล์ภาพ diff");
  assert.deepEqual(readFileSync(ref), readFileSync(join(v.out, v.steps[1].evidence)), "รอบผ่าน → ภาพอ้างอิงเป็นภาพรอบนี้");
  console.log("ok  หน้าตาเปลี่ยน:", vf[0].text);
  const moved = readFileSync(ref);
  look.moved = false;
  v = await run("visual", vis(true));
  assert.equal(v.end.status, "failed");
  assert.equal(v.steps[1].findings?.length, 1, "ต่างจากภาพอ้างอิงต้องแจ้งแม้รอบล้ม");
  assert.deepEqual(readFileSync(ref), moved, "รอบไม่ผ่านต้องไม่เขียนทับภาพอ้างอิง");
  look.moved = true;
  v = await run("visual", vis());
  assert.equal(v.steps[1].findings, undefined, "เทียบกับรอบล่าสุดที่ผ่าน (กล่องเลื่อน) ต้องไม่แจ้ง");
  console.log("ok  รอบไม่ผ่านไม่เขียนทับภาพอ้างอิง");
  console.log("ผ่านทั้งหมด");
} finally {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}
