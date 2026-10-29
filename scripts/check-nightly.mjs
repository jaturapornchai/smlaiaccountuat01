// ตัวตรวจรอบกลางคืน — ไม่รันสคริปต์ทดสอบจริง ไม่แตะเครือข่าย: ฉีดเวลาปลอม + startRuns ปลอมเข้า tick() ของ src/lib/nightly.ts
// รัน: pnpm check:nightly  (node ≥ 22.18 อ่านไฟล์ .ts ตรงๆ — nightly.ts จึงห้าม import โมดูลอื่นของแอป)
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadState, nightLines, saveState, summarize, tick } from "../src/lib/nightly.ts";

const dir = mkdtempSync(join(tmpdir(), "nightly-check-"));
let n = 0;
let passed = 0;
const ok = (cond, msg) => (assert.ok(cond, msg), passed++);
const eq = (a, b, msg) => (assert.deepEqual(a, b, msg), passed++);
const T = (iso) => Date.parse(iso); // ใส่ +07:00 เสมอ = เวลาไทย

// เซิร์ฟเวอร์จำลอง 1 เครื่อง: ไฟล์สถานะเดียว + ตัวนับสิ่งที่ถูกสั่งรัน · "รีสตาร์ท" = เรียก server() ใหม่กับไฟล์เดิม
const file = () => join(dir, `nightly-${++n}.json`);
function server(f, cfg, { active = () => 0, ids = ["a", "b", "c"] } = {}) {
  const started = [];
  const notes = [];
  let clock = 0;
  const env = { now: () => clock, config: () => cfg, load: () => loadState(f), save: (s) => saveState(s, f), active, scriptIds: () => ids, start: (i, night) => started.push({ ids: i, night }), note: (t) => notes.push(t) };
  return { started, notes, at: (iso) => ((clock = T(iso)), tick(env)) };
}
// เดินเวลาทีละ 30 วินาที (เท่าตัวตั้งเวลาจริง) คืนผลทุกครั้งที่ tick
function walk(s, from, to) {
  const out = [];
  for (let t = T(from); t <= T(to); t += 30_000) out.push(s.at(new Date(t).toISOString()));
  return out;
}

// 1) ปิดสวิตช์ → ทั้งคืนไม่สั่งสักครั้ง
{
  const s = server(file(), { enabled: false, time: "02:00" });
  walk(s, "2026-10-30T00:00:00+07:00", "2026-10-30T06:00:00+07:00");
  eq(s.started, [], "ปิดสวิตช์แล้วต้องไม่สั่ง");
}

// 2) เปิด 02:00 → ก่อนเวลาไม่สั่ง · ถึงเวลาสั่งครั้งเดียว · tick ต่อๆ ไปไม่สั่งซ้ำ
{
  const f = file();
  const s = server(f, { enabled: true, time: "02:00" });
  eq(s.at("2026-10-30T01:59:30+07:00"), "idle");
  eq(s.at("2026-10-30T02:00:00+07:00"), "started");
  walk(s, "2026-10-30T02:00:30+07:00", "2026-10-30T06:00:00+07:00");
  eq(s.started, [{ ids: ["a", "b", "c"], night: "2026-10-30" }], "ถึงเวลาแล้วสั่งครั้งเดียว");
  eq(loadState(f).history["2026-10-30"].planned, ["a", "b", "c"], "จดวันที่/รายการที่สั่งลงไฟล์");
  // รีสตาร์ทกลางคืน (ไฟล์เดิม) → ไม่สั่งซ้ำ · พรุ่งนี้ถึงเวลาก็สั่งของคืนใหม่
  const again = server(f, { enabled: true, time: "02:00" });
  eq(walk(again, "2026-10-30T02:30:00+07:00", "2026-10-30T04:00:00+07:00").filter((x) => x !== "idle"), [], "รีสตาร์ทแล้วต้องไม่สั่งซ้ำ");
  eq(again.at("2026-10-31T02:00:00+07:00"), "started");
  eq(again.started.map((x) => x.night), ["2026-10-31"]);
}

// 3) เขตเวลา: 19:00 UTC = 02:00 ไทย · 09:00 UTC = 16:00 ไทย (นอกช่วง)
{
  const s = server(file(), { enabled: true, time: "02:00" });
  eq(s.at("2026-10-29T19:00:00Z"), "started");
  const d = server(file(), { enabled: true, time: "02:00" });
  eq(d.at("2026-10-30T09:00:00Z"), "idle");
}

// 4) ถึงเวลาแต่ยังมีรอบค้าง → ไม่สั่งซ้อน, แจ้งครั้งเดียว, ค้างเกิน 3 ชม. = ข้ามคืนนั้น · ว่างทันในช่วงรอ = เริ่มทันที
{
  let busy = 1;
  const s = server(file(), { enabled: true, time: "02:00" }, { active: () => busy });
  const w = walk(s, "2026-11-01T02:00:00+07:00", "2026-11-01T02:44:30+07:00");
  ok(w.every((x) => x === "waiting") && !s.started.length, "ยุ่งอยู่ต้องไม่สั่งซ้อน");
  eq(s.notes.length, 1, "แจ้งรอคิวครั้งเดียว");
  busy = 0;
  eq(s.at("2026-11-01T02:45:00+07:00"), "started");
  eq(s.started.length, 1);

  const stuck = server(file(), { enabled: true, time: "02:00" }, { active: () => 1 });
  walk(stuck, "2026-11-02T02:00:00+07:00", "2026-11-02T06:00:00+07:00");
  eq(stuck.started, [], "ค้างเกินช่วงรอ = ข้ามคืนนั้น");
}

// 5) รีสตาร์ทตอนกลางวัน (deploy) ไม่ตามไปรัน · เซิร์ฟเวอร์ลุกมา 02:20 ที่ยังไม่เคยรันคืนนั้น = ตามรัน
{
  const day = server(file(), { enabled: true, time: "02:00" });
  eq(day.at("2026-11-03T14:00:00+07:00"), "idle", "deploy กลางวันต้องไม่เด้งรันเต็มชุด");
  const late = server(file(), { enabled: true, time: "02:00" });
  eq(late.at("2026-11-04T02:20:00+07:00"), "started");
}

// 6) เวลาตั้ง 23:30 → เลย 00:00 ยังตามรันได้ และใช้วันที่ของเวลาที่ตั้ง
{
  const s = server(file(), { enabled: true, time: "23:30" });
  eq(s.at("2026-11-05T00:10:00+07:00"), "started");
  eq(s.started[0].night, "2026-11-04");
  eq(s.at("2026-11-05T23:30:00+07:00"), "started");
  eq(s.started[1].night, "2026-11-05");
}

// 7) ไม่มีสคริปต์ในขอบเขต → จดคืนนั้นแล้ว แต่ไม่เรียก startRuns
{
  const s = server(file(), { enabled: true, time: "02:00" }, { ids: [] });
  eq(s.at("2026-11-06T02:00:00+07:00"), "started");
  eq(s.started, []);
}

// 8) ไฟล์สถานะ: ค่าเริ่มต้นปิด · เก็บประวัติแค่ 30 คืนล่าสุด
{
  const f = file();
  eq(loadState(f), { enabled: false, time: "02:00", history: {} }, "ยังไม่มีไฟล์ = ปิด 02:00");
  const history = Object.fromEntries(Array.from({ length: 35 }, (_, i) => [new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10), { startedAt: "x", planned: [] }]));
  saveState({ enabled: true, time: "03:15", history }, f);
  const back = loadState(f);
  eq([back.enabled, back.time, Object.keys(back.history).length], [true, "03:15", 30]);
  ok(!("2026-10-01" in back.history) && "2026-11-04" in back.history, "ตัดคืนเก่าสุดทิ้ง");
  JSON.parse(readFileSync(f, "utf8")); // เป็น JSON สมบูรณ์
}

// 9) สรุปเช้า + เทียบคืนก่อน
{
  const step = { i: 2, title: "ตรวจยอดภาษี", kind: "db.query", cleanup: false, status: "failed", detail: "ยอดไม่ตรง" };
  const run = (scriptId, status, x = {}) => ({ id: `R-${scriptId}`, scriptId, scriptTitle: `สคริปต์ ${scriptId}`, severityOnFail: "S2", status, steps: [], ...x });
  const A = [
    run("a", "passed"),
    run("b", "failed", { steps: [step], issue: { status: "sent", code: "SMLAIACC-1", at: "" } }),
    run("c", "failed", { steps: [step], issue: { status: "sent", code: "SMLAIACC-2", at: "" } }),
    run("d", "passed"),
    run("e", "passed"),
  ];
  const B = [
    run("a", "failed", { steps: [step], severityOnFail: "S1", issue: { status: "sent", code: "SMLAIACC-9", at: "" } }),
    run("b", "passed"),
    run("c", "failed", { steps: [step], issue: { status: "duplicate", code: "SMLAIACC-2", at: "" } }),
    run("d", "error", { message: "ตัวรันพัง", noIssue: "ตรวจสคริปต์ก่อน" }),
    run("e", "passed"),
    run("g", "running"),
  ]; // f ตั้งใจรันแต่ไม่มีผล (ตกคิวตอนรีสตาร์ท)
  const st = {
    enabled: true,
    time: "02:00",
    history: {
      "2026-10-29": { startedAt: "2026-10-28T19:00:00Z", planned: ["a", "b", "c", "d", "e"] },
      "2026-10-30": { startedAt: "2026-10-29T19:00:00Z", planned: ["a", "b", "c", "d", "e", "f", "g"] },
    },
  };

  const s = summarize("2026-10-30", st, B, { night: "2026-10-29", runs: A });
  eq([s.planned, s.passed, s.failed, s.error, s.pending, s.skipped], [7, 2, 2, 1, 1, 1], "นับผ่าน/ล้ม/ผิดพลาด/กำลังรัน/ข้าม");
  eq(s.failures.map((f) => [f.scriptId, f.since, f.ticket ?? null]), [["a", "new", "SMLAIACC-9"], ["d", "new", null], ["c", "same", "SMLAIACC-2"]], "ล้มใหม่/ล้มต่อเนื่อง เรียง S1 ก่อน ล้มใหม่ก่อน");
  eq(s.fixed.map((f) => f.scriptId), ["b"], "หายแล้ว = คืนก่อนล้ม คืนนี้ผ่าน");
  eq(s.failures[0].reason, "ขั้น 3 ตรวจยอดภาษี — ยอดไม่ตรง");
  const text = nightLines(s).join("\n");
  ok(text.includes("ล้มใหม่ 2 · หายแล้ว 1 · ล้มต่อเนื่อง 1") && text.includes("ticket SMLAIACC-9") && text.includes("ไม่เปิด ticket: ตรวจสคริปต์ก่อน") && text.includes("ข้าม 1") && text.includes("กำลังรัน 1"), `ข้อความสรุป:\n${text}`);

  const first = summarize("2026-10-29", st, A);
  eq([first.prevNight, first.failures.map((f) => f.since)], [undefined, [undefined, undefined]], "คืนแรกไม่มีคืนก่อนให้เทียบ");
  ok(nightLines(first).join("\n").includes("ยังไม่มีคืนก่อนให้เทียบ"));
}

rmSync(dir, { recursive: true, force: true });
console.log(`ผ่านทั้งหมด ${passed} ข้อ`);
