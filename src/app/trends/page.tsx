"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp } from "lucide-react";
import type { FlakyScript, ModuleTrend, RULES, SlowScript, Trend } from "@/lib/run-history";
import { call } from "@/lib/http";
import { fmtDur } from "@/lib/format";
import { MODULES, ROLES } from "@/lib/swarm-data";

type Named<T> = T & { title: string };
type Data = Omit<Trend, "slow" | "flaky"> & { slow: Named<SlowScript>[]; flaky: Named<FlakyScript>[]; rules: typeof RULES; maxDays: number };

const RANGES = [7, 30, 90];
const pct = (r: number | null) => (r === null ? "-" : `${Math.round(r * 100)}%`);
const dm = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;
const rateColor = (r: number) => (r >= 0.9 ? "#34d399" : r >= 0.6 ? "#fbbf24" : "#fb7185");
const runHref = (id: string) => `/?run=${encodeURIComponent(id)}`; // หน้าหลักเปิดรอบนั้นในแผงรายละเอียด

// แถวเดียวต่อโมดูล: แท่งละวัน สูง = อัตราผ่านของวันนั้น · วันที่ไม่มีรอบเป็นขีดจาง
const COLS = "grid grid-cols-[minmax(6.5rem,11rem)_minmax(0,1fr)_8rem] items-center gap-3";
function ModuleRow({ m, days }: { m: ModuleTrend; days: string[] }) {
  const W = 10;
  const H = 36;
  const by = new Map(m.days.map((d) => [d.day, d]));
  const label = MODULES.find((x) => x.role === m.module)?.roleTitle ?? m.module;
  return (
    <div className={COLS}>
      <span className="truncate text-sm font-semibold">{label}</span>
      <svg viewBox={`0 0 ${days.length * W} ${H}`} preserveAspectRatio="none" className="h-9 w-full overflow-visible" role="img" aria-label={`อัตราผ่านรายวันของ ${label}`}>
        {days.map((day, i) => {
          const d = by.get(day);
          const h = d?.rate == null ? 2 : Math.max(2, d.rate * H);
          return (
            <rect key={day} x={i * W + 1} y={H - h} width={W - 2} height={h} rx={1} fill={d?.rate == null ? "rgba(255,255,255,0.12)" : rateColor(d.rate)}>
              <title>{d ? `${dm(day)} · ผ่าน ${d.passed} ไม่ผ่าน ${d.failed} (${pct(d.rate)})` : `${dm(day)} · ไม่มีรอบ`}</title>
            </rect>
          );
        })}
      </svg>
      <span className="baseline-center justify-end gap-2 text-right text-sm tabular-nums">
        <b style={{ color: m.rate === null ? undefined : rateColor(m.rate) }}>{pct(m.rate)}</b>
        <span className="text-[0.72rem] text-slate-400">
          {m.passed}/{m.passed + m.failed} รอบ
        </span>
      </span>
    </div>
  );
}

const Card: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="glass mt-6 rounded-3xl px-5 py-4">
    <h2 className="text-lg font-bold">{title}</h2>
    <p className="mt-0.5 text-[0.78rem] text-slate-400">{hint}</p>
    <div className="mt-3 space-y-2">{children}</div>
  </section>
);
const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-sm text-slate-400">{children}</p>;
const link = "min-w-0 truncate text-sm font-semibold text-cyan-100 hover:underline";
const LEGEND = [["#34d399", "≥90%"], ["#fbbf24", "≥60%"], ["#fb7185", "ต่ำกว่า"]];

export default function TrendsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setErr("");
    call<Data>(`/api/history?days=${days}`).then(setData, (e: Error) => setErr(e.message));
  }, [days]);

  const modules = data ? [...data.modules].sort((a, b) => ROLES.indexOf(a.module as never) - ROLES.indexOf(b.module as never)) : [];
  const k = data?.rules;
  return (
    <main className="mx-auto max-w-6xl px-[clamp(1rem,3vw,2.5rem)] py-8">
      <Link href="/" className="baseline-center gap-2 text-sm text-slate-400 transition hover:text-cyan-200">
        <ArrowLeft className="h-4 w-4" />
        กลับหน้าฝูงบอท
      </Link>
      <header className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="baseline-center gap-3 text-[clamp(1.5rem,3vw,2.2rem)] font-extrabold">
            <TrendingUp className="h-[1em] w-[1em] shrink-0 text-cyan-300" />
            แนวโน้มผลทดสอบ
          </h1>
          <p className="mt-2 max-w-3xl text-[0.95rem] text-slate-300">อ่านจากประวัติถาวรของทุกรอบที่จบแล้ว (เก็บแยกจากโฟลเดอร์รอบ จึงไม่หายแม้รอบเก่าหลุดจากหน้าหลัก) กดชื่อสคริปต์หรือจุดสีเพื่อเปิดรอบนั้นที่หน้าหลัก</p>
        </div>
        <div className="baseline-center gap-2" role="group" aria-label="ช่วงเวลา">
          {RANGES.filter((r) => r <= (data?.maxDays ?? 90)).map((r) => (
            <button key={r} onClick={() => setDays(r)} aria-pressed={days === r} className={`glass baseline-center rounded-xl px-4 py-2 text-sm font-semibold transition ${days === r ? "border-cyan-300/50 text-cyan-100" : "text-slate-300 hover:text-white"}`}>
              {r} วัน
            </button>
          ))}
        </div>
      </header>

      {err && <p className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">โหลดประวัติไม่ได้: {err}</p>}
      {!data && !err && <p className="mt-6 text-sm text-slate-400">กำลังโหลด…</p>}

      {data && (
        <>
          <Card title="อัตราผ่านต่อโมดูลต่อวัน" hint={`นับเป็นจำนวนรอบ (ไม่นับรอบที่ผิดพลาด/ถูกหยุด) · วันตามเวลาไทย · ${dm(data.days[0])} – ${dm(data.days[data.days.length - 1])} · ทั้งหมด ${data.totalRuns} รอบ`}>
            {modules.length ? (
              <>
                {modules.map((m) => (
                  <ModuleRow key={m.module} m={m} days={data.days} />
                ))}
                <div className={`${COLS} text-[0.7rem] text-slate-500`}>
                  <span />
                  <span className="flex items-center justify-between gap-3">
                    <span>{dm(data.days[0])}</span>
                    <span className="baseline-center gap-3 whitespace-nowrap">
                      {LEGEND.map(([c, t]) => (
                        <span key={t} className="baseline-center gap-1">
                          <i className="h-2 w-2 rounded-sm" style={{ background: c }} />
                          {t}
                        </span>
                      ))}
                    </span>
                    <span>{dm(data.days[data.days.length - 1])}</span>
                  </span>
                  <span />
                </div>
              </>
            ) : (
              <Empty>ยังไม่มีรอบที่ผ่าน/ไม่ผ่านในช่วงนี้ — ระบบจดทุกรอบที่จบ และเติมจากโฟลเดอร์รอบเดิมทุกครั้งที่เปิดเซิร์ฟเวอร์</Empty>
            )}
          </Card>

          <Card title="สคริปต์ที่ช้าลงผิดปกติ" hint={k && `เทียบค่ากลางเวลารวมของ ${k.slowRecent} รอบผ่านล่าสุด กับค่ากลางของรอบผ่านก่อนหน้า (ต้องมีอย่างน้อย ${k.slowBaseMin} รอบ) · ช้ากว่า ≥ ${k.slowRatio} เท่า และเกิน ${k.slowMinExtraMs / 1000} วิ`}>
            {data.slow.length ? (
              data.slow.map((s) => (
                <div key={s.scriptId} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4">
                  <Link href={runHref(s.runId)} className={link} title={s.scriptId}>
                    {s.title}
                  </Link>
                  <span className="text-sm tabular-nums text-rose-200">ล่าสุด {fmtDur(Math.round(s.recentMs))}</span>
                  <span className="text-sm tabular-nums text-slate-400">ปกติ {fmtDur(Math.round(s.baseMs))}</span>
                  <b className="text-sm tabular-nums text-amber-200">ช้าลง {s.ratio.toFixed(1)} เท่า</b>
                </div>
              ))
            ) : (
              <Empty>ไม่พบสคริปต์ที่ช้าลงผิดปกติ (หรือยังมีรอบผ่านไม่พอให้เทียบ)</Empty>
            )}
          </Card>

          <Card title="สคริปต์ที่ผลไม่นิ่ง (ผ่านสลับไม่ผ่าน)" hint={k && `อย่างน้อย ${k.flakyMinRuns} รอบ สลับผล ≥ ${k.flakyMinFlips} ครั้ง และสลับ ≥ ${Math.round(k.flakyFlipRate * 100)}% ของรอบ · ไม่นับรอบตรวจซ้ำหลังแก้ · จุดซ้าย→ขวา = เก่า→ใหม่ (สูงสุด 12 รอบ)`}>
            {data.flaky.length ? (
              data.flaky.map((f) => (
                <div key={f.scriptId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4">
                  <Link href={runHref(f.last[f.last.length - 1].id)} className={link} title={f.scriptId}>
                    {f.title}
                  </Link>
                  <span className="text-sm tabular-nums text-slate-300">
                    สลับ {f.flips} ครั้งใน {f.runs} รอบ <span className="text-[0.72rem] text-slate-500">(ผ่าน {f.passed} ไม่ผ่าน {f.failed})</span>
                  </span>
                  <span className="baseline-center gap-1.5">
                    {f.last.map((r) => (
                      <Link key={r.id} href={runHref(r.id)} title={`${r.ok ? "ผ่าน" : "ไม่ผ่าน"} · ${r.id}`} className={`h-3 w-3 rounded-full ${r.ok ? "bg-emerald-400" : "bg-rose-400"}`} />
                    ))}
                  </span>
                </div>
              ))
            ) : (
              <Empty>ไม่พบสคริปต์ที่ผลไม่นิ่งในช่วงนี้</Empty>
            )}
          </Card>

          <p className="mt-6 text-[0.75rem] text-slate-500">อ่านเฉพาะไฟล์รายเดือนที่คาบเกี่ยวช่วงที่เลือก (สูงสุด {data.maxDays} วันต่อคำขอ) ไม่โหลดทั้งประวัติ</p>
        </>
      )}
    </main>
  );
}
