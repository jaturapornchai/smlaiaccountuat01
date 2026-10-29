"use client";

import React, { useEffect, useState } from "react";
import { Moon } from "lucide-react";
import { ScriptRun } from "@/types/bot";
import type { Failure, NightSummary } from "@/lib/nightly";
import type { NightReport } from "@/lib/nightly-run";
import { call } from "@/lib/http";
import { fmtTime } from "@/lib/format";

const Chip: React.FC<{ n: number; label: string; cls: string; title?: string }> = ({ n, label, cls, title }) => (
  <span title={title} className={`rounded-xl border px-3 py-1.5 text-[0.8rem] ${cls}`}>
    {label} <b className="text-base">{n}</b>
  </span>
);

const Section: React.FC<{ title: string; cls: string; children: React.ReactNode }> = ({ title, cls, children }) => (
  <div className="mt-4">
    <h3 className={`text-[0.85rem] font-bold ${cls}`}>{title}</h3>
    <ul className="mt-1.5 space-y-1.5">{children}</ul>
  </div>
);

const Row: React.FC<{ f: Failure; onOpenRun: (id: string) => void }> = ({ f, onOpenRun }) => (
  <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="rounded-md bg-rose-500/15 px-1.5 text-[0.7rem] font-bold text-rose-200">{f.severity}</span>
      <span className="text-[0.85rem] font-semibold">{f.title}</span>
      <span className="font-mono text-[0.68rem] text-slate-500">{f.scriptId}</span>
      <button onClick={() => onOpenRun(f.runId)} className="ml-auto text-[0.7rem] text-cyan-300 hover:underline">
        ดูรอบ {f.runId}
      </button>
    </div>
    {f.reason && <p className="mt-1 break-words text-[0.75rem] leading-snug text-rose-200">{f.reason}</p>}
    <p className="mt-1 text-[0.75rem] text-slate-400">{f.ticket ? <>ticket ใน IssueMate: <b className="text-violet-200">{f.ticket}</b></> : f.noIssue ? `ไม่เปิด ticket: ${f.noIssue}` : "ยังไม่มี ticket"}</p>
  </li>
);

// สรุปเช้าของรอบ regression กลางคืน (src/lib/nightly.ts) · เปิด/ปิดและตั้งเวลาที่ปุ่ม "ตั้งค่า"
export const NightlyCard: React.FC<{ runs: ScriptRun[]; onOpenRun: (id: string) => void }> = ({ runs, onOpenRun }) => {
  const [data, setData] = useState<NightReport | null>(null);
  const [night, setNight] = useState<string>();
  const [err, setErr] = useState("");
  const stamp = runs.reduce((a, r) => (r.finishedAt && r.finishedAt > a ? r.finishedAt : a), "");

  useEffect(() => {
    call<NightReport>(`/api/nightly${night ? `?date=${night}` : ""}`).then((d) => (setData(d), setErr("")), (e: Error) => setErr(e.message));
  }, [stamp, night]);

  const s: NightSummary | undefined = data?.summary;
  const group = (since: Failure["since"]) => s?.failures.filter((f) => f.since === since) ?? [];

  return (
    <section aria-label="สรุปรอบกลางคืน" className="glass rounded-3xl p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="baseline-center gap-2 text-lg font-bold">
          <Moon className="h-5 w-5 text-indigo-300" /> สรุปรอบกลางคืน
        </h2>
        <p className="text-[0.8rem] text-slate-400">
          {data ? (data.enabled ? `เปิดอยู่ · รันสคริปต์ในคลังทั้งหมด (ไม่รวม ask-*/auto-*) ทุกคืนเวลา ${data.time} น. เวลาไทย` : "ปิดอยู่ · เปิดและตั้งเวลาได้ที่ปุ่ม ตั้งค่า (ค่าเริ่มต้นปิด)") : "กำลังโหลด…"}
        </p>
        {data && data.nights.length > 1 && (
          <select value={s?.night ?? ""} onChange={(e) => setNight(e.target.value)} className="ml-auto rounded-xl border border-white/10 bg-black/30 px-2.5 py-1 text-[0.78rem]">
            {data.nights.map((d) => (
              <option key={d} value={d}>
                คืน {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {err && <p className="mt-3 text-[0.8rem] text-rose-300">โหลดสรุปไม่สำเร็จ: {err}</p>}
      {data && !s && <p className="mt-3 text-[0.85rem] text-slate-400">ยังไม่เคยรันรอบกลางคืน — พอเปิดและถึงเวลา สรุปของคืนนั้นจะขึ้นที่นี่</p>}
      {s && (
        <>
          <p className="mt-3 text-[0.8rem] text-slate-400">
            คืน {s.night}
            {s.startedAt ? ` · เริ่ม ${fmtTime(s.startedAt)} น.` : ""} · ตั้งใจรัน {s.planned} สคริปต์
            {s.pending ? " · ยังรันไม่จบ" : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip n={s.passed} label="ผ่าน" cls="border-emerald-400/40 bg-emerald-400/10 text-emerald-200" />
            <Chip n={s.failed} label="ล้ม" cls="border-rose-400/40 bg-rose-500/10 text-rose-200" />
            {s.error > 0 && <Chip n={s.error} label="ผิดพลาด" cls="border-amber-300/40 bg-amber-400/10 text-amber-200" title="ตัวรันพังก่อนส่งผล" />}
            {s.skipped > 0 && <Chip n={s.skipped} label="ข้าม" cls="border-white/20 bg-white/5 text-slate-300" title="ตั้งใจรันแต่ไม่จบ: ถูกสั่งหยุด หรือตกคิวตอนเซิร์ฟเวอร์รีสตาร์ท" />}
            {s.pending > 0 && <Chip n={s.pending} label="กำลังรัน" cls="border-cyan-300/40 bg-cyan-400/10 text-cyan-200" />}
          </div>

          <p className="mt-3 text-[0.8rem] text-slate-300">
            {s.prevNight ? (
              <>
                เทียบกับคืน {s.prevNight}: ล้มใหม่ <b className="text-rose-200">{group("new").length}</b> · หายแล้ว <b className="text-emerald-200">{s.fixed.length}</b> · ล้มต่อเนื่อง <b className="text-amber-200">{group("same").length}</b>
              </>
            ) : (
              "ยังไม่มีคืนก่อนให้เทียบ"
            )}
          </p>

          {group("new").length > 0 && (
            <Section title="ล้มใหม่ (คืนก่อนผ่านหรือไม่มีผล)" cls="text-rose-200">
              {group("new").map((f) => <Row key={f.runId} f={f} onOpenRun={onOpenRun} />)}
            </Section>
          )}
          {group("same").length > 0 && (
            <Section title="ล้มต่อเนื่อง (คืนก่อนก็ล้ม)" cls="text-amber-200">
              {group("same").map((f) => <Row key={f.runId} f={f} onOpenRun={onOpenRun} />)}
            </Section>
          )}
          {!s.prevNight && s.failures.length > 0 && (
            <Section title="รายการที่ล้ม" cls="text-rose-200">
              {s.failures.map((f) => <Row key={f.runId} f={f} onOpenRun={onOpenRun} />)}
            </Section>
          )}
          {s.fixed.length > 0 && (
            <Section title="หายแล้ว (คืนก่อนล้ม คืนนี้ผ่าน)" cls="text-emerald-200">
              {s.fixed.map((f) => (
                <li key={f.runId} className="text-[0.8rem] text-slate-300">
                  {f.title} <span className="font-mono text-[0.68rem] text-slate-500">{f.scriptId}</span>
                </li>
              ))}
            </Section>
          )}
        </>
      )}
    </section>
  );
};
