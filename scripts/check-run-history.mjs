// ตัวตรวจประวัติรอบทดสอบ (src/lib/run-history.ts) ด้วยไฟล์ปลอมในโฟลเดอร์ชั่วคราว — ไม่แตะ runs/ หรือ data/ จริง และไม่รันสคริปต์ทดสอบ SML
// รัน: pnpm check:history (ต้องใช้ Node 22.18+ ที่อ่าน .ts ตรงได้)
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backfillHistory, buildTrend, dayOf, findFlaky, findSlow, loadTrend, passRateByModuleDay, readRows, recordRun, toRow } from "../src/lib/run-history.ts";

const tmp = mkdtempSync(join(tmpdir(), "run-history-check-"));
let n = 0;
const check = (name, fn) => (fn(), console.log(`ผ่าน ${++n}. ${name}`));

let seq = 0;
// ScriptRun ปลอมที่จบแล้ว · ms = เวลารวมของขั้น (แบ่งเป็น 2 ขั้น)
const mk = (scriptId, status, finishedAt, o = {}) => ({
  id: `R${String(++seq).padStart(4, "0")}`, scriptId, scriptTitle: scriptId, module: o.module ?? "tax", lens: "data", severityOnFail: "S2", botId: "bot-01", target: "x", headed: false,
  status, queuedAt: finishedAt, startedAt: finishedAt, finishedAt, steps: o.ms ? [{ durationMs: o.ms - 100 }, { durationMs: 100 }] : [],
  passed: status === "passed" ? 2 : 0, failed: status === "failed" ? 1 : 0, skipped: 0, issues: 0, retestOf: o.retestOf, issue: o.ticket ? { status: "sent", code: o.ticket, at: finishedAt } : undefined,
});
const row = (...a) => toRow(mk(...a));
const day = (d, h = 3) => `2026-10-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00.000Z`;
const ALL = [Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-12-31T00:00:00Z")];

// 1) อัตราผ่านต่อโมดูลต่อวัน (วันตามเวลาไทย · error/stopped ไม่นับ)
check("อัตราผ่านต่อวัน: ตัดวันตามเวลาไทย และไม่นับ error/stopped", () => {
  const rows = [
    row("a", "passed", "2026-10-01T16:30:00.000Z"), // ไทย 1 ต.ค. 23:30
    row("a", "passed", "2026-10-01T10:00:00.000Z"),
    row("b", "failed", "2026-10-01T05:00:00.000Z"),
    row("a", "error", "2026-10-01T06:00:00.000Z"), // ไม่นับ
    row("a", "stopped", "2026-10-01T07:00:00.000Z"), // ไม่นับ
    row("a", "failed", "2026-10-01T17:30:00.000Z"), // ไทย 2 ต.ค. 00:30 → เป็นวันถัดไป
    row("s", "passed", "2026-10-02T03:00:00.000Z", { module: "sales" }),
  ].sort((x, y) => x.finishedAt.localeCompare(y.finishedAt));
  assert.equal(dayOf("2026-10-01T16:59:59.999Z"), "2026-10-01");
  assert.equal(dayOf("2026-10-01T17:00:00.000Z"), "2026-10-02");
  const tax = passRateByModuleDay(rows).find((m) => m.module === "tax");
  assert.deepEqual(tax.days.map((d) => [d.day, d.passed, d.failed]), [["2026-10-01", 2, 1], ["2026-10-02", 0, 1]]);
  assert.equal(tax.days[0].rate, 2 / 3);
  assert.equal(tax.days[1].rate, 0);
  assert.equal(tax.passed, 2);
  assert.equal(tax.failed, 2);
  assert.equal(tax.rate, 0.5);
  assert.equal(passRateByModuleDay(rows).find((m) => m.module === "sales").rate, 1);
});

// 2) สคริปต์ช้าลงผิดปกติ
check("จับสคริปต์ช้า: ช้าจริงถูกจับ · แกว่งเล็กน้อย/สั้นเกินไป/รอบน้อย/รอบไม่ผ่านไม่ถูกจับ", () => {
  const rows = [];
  const add = (id, ms, status = "passed") => rows.push(row(id, status, day(1), { ms }));
  const times = (id, list) => list.forEach((ms) => add(id, ms));
  times("slow", [10_000, 10_500, 9_500, 10_200, 9_800, 10_100, 20_000, 21_000, 19_500]); // ปกติ ~10 วิ → ล่าสุด ~20 วิ
  times("jitter", [10_000, 10_500, 9_500, 10_200, 9_800, 10_100, 10_900, 9_300, 10_400]);
  times("short", [1_000, 1_100, 900, 1_000, 1_050, 980, 2_500, 2_600, 2_400]); // 2.5 เท่า แต่เกินปกติแค่ ~1.5 วิ
  times("few", [10_000, 10_000, 10_000, 30_000, 30_000, 30_000]); // รอบผ่านไม่พอเทียบ
  times("failquick", [10_000, 10_500, 9_500, 10_200, 9_800, 10_100, 10_000, 10_300, 10_100]);
  for (let i = 0; i < 3; i++) add("failquick", 60_000, "failed"); // รอบไม่ผ่านที่ค้างรอ timeout ช้าเป็นปกติ ไม่ใช่ความช้าของสคริปต์ ห้ามถูกนับ
  // เรียงเวลาให้ตรงลำดับที่ใส่
  rows.forEach((r, i) => (r.finishedAt = new Date(Date.parse("2026-10-01T00:00:00Z") + i * 3600_000).toISOString()));
  const slow = findSlow(rows);
  assert.deepEqual(slow.map((s) => s.scriptId), ["slow"]);
  assert.ok(slow[0].ratio > 1.9 && slow[0].ratio < 2.1, `ratio ${slow[0].ratio}`);
  assert.equal(slow[0].baseMs, 10_050); // ค่ากลางของ 6 รอบแรก (10,000 กับ 10,100 เฉลี่ยกัน)
  assert.equal(slow[0].recentMs, 20_000);
  assert.equal(slow[0].runId, rows.filter((r) => r.scriptId === "slow").at(-1).id);
});

// 3) สคริปต์ผลไม่นิ่ง
check("จับผลไม่นิ่ง: ผ่านสลับล้มถูกจับ · พังแล้วแก้ไม่ถูกจับ · รอบตรวจซ้ำไม่นับ", () => {
  const seqOf = (id, marks) => marks.split("").map((c, i) => row(id, c === "P" || c === "p" ? "passed" : "failed", new Date(Date.parse("2026-10-01T00:00:00Z") + i * 3600_000).toISOString(), { retestOf: c === "p" || c === "f" ? "SML-1" : undefined }));
  const rows = [...seqOf("flaky", "PFPFPF"), ...seqOf("fixed", "PPPFFFPPPP"), ...seqOf("stable", "PPPPPP"), ...seqOf("retested", "PFpFpF"), ...seqOf("tiny", "PFP")];
  const flaky = findFlaky(rows);
  assert.deepEqual(flaky.map((f) => f.scriptId), ["flaky"]);
  assert.equal(flaky[0].flips, 5);
  assert.equal(flaky[0].runs, 6);
  assert.equal(flaky[0].last.length, 6);
  assert.equal(flaky[0].last[0].ok, true);
  // fixed: สลับ 2 ครั้งใน 10 รอบ = 22% < 30% / retested: ถ้านับรอบตรวจซ้ำจะสลับ 5 ครั้ง แต่ตัดทิ้งเหลือ P F F F
});

// 4) backfill ไม่ซ้ำ + บรรทัดที่ได้ ticket ทีหลัง + อ่านมีขอบเขต
check("backfill เติมครั้งเดียวไม่ซ้ำ · ข้ามรอบที่ยังไม่จบ/โฟลเดอร์อื่น · จดซ้ำไม่งอก", () => {
  const runDir = join(tmp, "runs");
  const hist = join(tmp, "hist");
  const put = (r) => (mkdirSync(join(runDir, r.id), { recursive: true }), writeFileSync(join(runDir, r.id, "run.json"), JSON.stringify(r)));
  const r1 = mk("x", "passed", day(5), { ms: 5000 });
  const r2 = mk("x", "failed", day(6), { ms: 3000, ticket: "SMLAIACC-9", retestOf: "SMLAIACC-8" });
  const r3 = { ...mk("x", "running", day(7)), finishedAt: undefined };
  [r1, r2, r3].forEach(put);
  mkdirSync(join(runDir, "logs"), { recursive: true });
  writeFileSync(join(runDir, "mcp-tokens.json"), "[]");
  mkdirSync(join(runDir, "emptydir"));

  recordRun(r1, hist); // r1 ถูกจดตอนรอบจบแล้ว → backfill ต้องไม่จดซ้ำ
  recordRun(r1, hist); // save() ซ้ำโดยไม่มีอะไรเปลี่ยน → ไม่งอกบรรทัด
  assert.equal(backfillHistory(runDir, hist), 1); // เหลือแค่ r2
  assert.equal(backfillHistory(runDir, hist), 0); // รันซ้ำไม่เติมอีก
  const lines = readFileSync(join(hist, "2026-10.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  const got = readRows(...ALL, hist);
  assert.deepEqual(got.map((r) => r.id), [r1.id, r2.id]);
  assert.deepEqual(got[1], { id: r2.id, scriptId: "x", module: "tax", lens: "data", bot: "bot-01", status: "failed", passed: 0, failed: 1, durationMs: 3000, startedAt: day(6), finishedAt: day(6), ticket: "SMLAIACC-9", retestOf: "SMLAIACC-8" });

  // ticket มาทีหลัง (sendToIssueMate เรียก save อีกรอบ) → ต่อบรรทัดใหม่ อ่านแล้วได้ ticket และยังเป็น 1 รอบ
  const late = { ...r1, issue: { status: "sent", code: "SMLAIACC-77", at: day(5) } };
  recordRun(late, hist);
  recordRun(late, hist);
  assert.equal(readFileSync(join(hist, "2026-10.jsonl"), "utf8").trim().split("\n").length, 3);
  const after = readRows(...ALL, hist);
  assert.equal(after.length, 2);
  assert.equal(after.find((r) => r.id === r1.id).ticket, "SMLAIACC-77");

  // บรรทัดเขียนไม่จบท้ายไฟล์ไม่ทำให้อ่านพัง
  appendFileSync(join(hist, "2026-10.jsonl"), '{"id":"BROKEN","scri');
  assert.equal(readRows(...ALL, hist).length, 2);
});

check("อ่านมีขอบเขต: ไม่แตะไฟล์เดือนนอกช่วง · กรองช่วงวัน · ตัดช่วงไม่เกิน 90 วัน", () => {
  const hist = join(tmp, "bounded");
  mkdirSync(join(hist, "2025-01.jsonl"), { recursive: true }); // ถ้าโค้ดพยายามอ่านไฟล์นี้จะ throw (EISDIR) — พิสูจน์ว่าไม่แตะ
  mkdirSync(join(hist, "2027-05.jsonl"), { recursive: true });
  [mk("x", "passed", "2026-09-30T12:00:00.000Z"), mk("x", "passed", "2026-10-01T12:00:00.000Z"), mk("x", "failed", "2026-10-15T12:00:00.000Z"), mk("x", "passed", "2026-11-02T12:00:00.000Z")].forEach((r) => recordRun(r, hist));
  const from = Date.parse("2026-10-01T00:00:00Z");
  const to = Date.parse("2026-10-20T00:00:00Z");
  assert.deepEqual(readRows(from, to, hist).map((r) => r.finishedAt), ["2026-10-01T12:00:00.000Z", "2026-10-15T12:00:00.000Z"]);
  assert.equal(readRows(Date.parse("2026-09-25T00:00:00Z"), Date.parse("2026-11-05T00:00:00Z"), hist).length, 4); // ข้ามเดือนอ่านครบ 3 ไฟล์

  const now = Date.parse("2026-10-16T05:00:00Z"); // ไทย 16 ต.ค. 12:00
  const t7 = loadTrend(7, now, hist);
  assert.equal(t7.days.length, 7);
  assert.deepEqual([t7.days[0], t7.days.at(-1)], ["2026-10-10", "2026-10-16"]);
  assert.equal(t7.from, "2026-10-09T17:00:00.000Z"); // 00:00 ไทยของวันแรก
  assert.equal(t7.totalRuns, 1); // เหลือเฉพาะรอบ 15 ต.ค.
  assert.equal(loadTrend(9999, now, hist).days.length, 90);
  assert.equal(loadTrend(0, now, hist).days.length, 30); // ค่าเสียใช้ค่าเริ่มต้น
  assert.equal(buildTrend([], now, now).totalRuns, 0);
});

rmSync(tmp, { recursive: true, force: true });
console.log(`\nตัวตรวจประวัติรอบทดสอบผ่านครบ ${n} ข้อ`);
