"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, RefreshCw, Search } from "lucide-react";
import { ScriptRun } from "@/types/bot";
import type { CheckResult, Delivery, ItemStatus, MenuResult, Verdict } from "@/lib/delivery";
import { call } from "@/lib/http";
import { LENSES, MODULES } from "@/lib/swarm-data";
import { fmtTime } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  ready: { label: "พร้อมส่งมอบ", cls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" },
  conditional: { label: "ส่งมอบได้แบบมีเงื่อนไข", cls: "border-amber-300/40 bg-amber-400/10 text-amber-200" },
  incomplete: { label: "ยังรับรองการส่งมอบไม่ได้ (ทดสอบไม่ครบ)", cls: "border-amber-300/40 bg-amber-400/10 text-amber-200" },
  blocked: { label: "ยังส่งมอบไม่ได้", cls: "border-rose-400/50 bg-rose-500/10 text-rose-200" },
};
const TABS = [
  { key: "menu", label: "เมนู" },
  { key: "report", label: "รายงาน" },
  { key: "check", label: "อื่นๆ (สคริปต์ตรวจ ข้อมูล/API/ขั้นตอน)" },
] as const;
const FILTERS: { key: ItemStatus | "all"; label: string }[] = [
  { key: "failed", label: "ไม่ผ่าน" },
  { key: "passed", label: "ผ่าน" },
  { key: "untested", label: "ยังไม่ทดสอบ" },
  { key: "all", label: "ทั้งหมด" },
];
const moduleName = (m: string) => MODULES.find((x) => x.role === m)?.roleTitle ?? m;
const lensName = (l: string) => LENSES.find((x) => x.key === l)?.label ?? l;
const ORDER: Record<ItemStatus, number> = { failed: 0, passed: 1, untested: 2 };

type Row = { id: string; group: string; name: string; sub: string; status: ItemStatus; reason?: string; runId?: string; at?: string };
const menuRow = (m: MenuResult): Row => ({ id: m.key, group: m.group, name: m.text, sub: m.key, status: m.status, reason: m.reason, runId: m.runId, at: m.at });
const checkRow = (c: CheckResult): Row => ({ id: c.scriptId, group: moduleName(c.module), name: c.title, sub: `${c.scriptId} · ${lensName(c.lens)} · ${c.severity}${c.ai ? " · AI เขียนจากคำสั่ง (ต้องให้คนยืนยัน)" : ""}`, status: c.status, reason: c.reason, runId: c.runId, at: c.at });

export const DeliveryReport: React.FC<{ runs: ScriptRun[]; onOpenRun: (id: string) => void }> = ({ runs, onOpenRun }) => {
  const [data, setData] = useState<Delivery | null>(null);
  const [err, setErr] = useState("");
  const [picked, setTab] = useState<(typeof TABS)[number]["key"] | null>(null);
  // ยังไม่ได้เลือกแท็บ = เปิดแท็บแรกที่มีรายการไม่ผ่าน
  const failedIn = (k: (typeof TABS)[number]["key"]) => (k === "check" ? data?.checks : data?.menus.filter((m) => m.report === (k === "report")))?.some((x) => x.status === "failed");
  const tab = picked ?? TABS.find((t) => failedIn(t.key))?.key ?? "menu";
  const [filter, setFilter] = useState<ItemStatus | "all">("failed");
  const [q, setQ] = useState("");
  const stamp = runs.reduce((a, r) => (r.finishedAt && r.finishedAt > a ? r.finishedAt : a), "");

  const load = () => call<Delivery>("/api/delivery").then(setData, (e: Error) => setErr(e.message));
  useEffect(() => {
    load();
  }, [stamp]);

  const rows = useMemo(() => {
    if (!data) return { all: [] as Row[], shown: [] as Row[] };
    const all = tab === "check" ? data.checks.map(checkRow) : data.menus.filter((m) => m.report === (tab === "report")).map(menuRow);
    const needle = q.trim().toLowerCase();
    const shown = all
      .filter((r) => (filter === "all" || r.status === filter) && (!needle || `${r.name} ${r.sub} ${r.group}`.toLowerCase().includes(needle)))
      .sort((a, b) => a.group.localeCompare(b.group, "th") || ORDER[a.status] - ORDER[b.status]);
    return { all, shown };
  }, [data, tab, filter, q]);

  const n = (s: ItemStatus) => rows.all.filter((r) => r.status === s).length;
  const v = data ? VERDICT[data.verdict] : null;

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="baseline-center gap-2 text-lg font-bold">
          <ClipboardCheck className="h-5 w-5 text-cyan-300" /> สรุปผลล่าสุด · ส่งมอบได้หรือไม่
        </h2>
        <p className="text-[0.8rem] text-slate-400">ผลจากรอบรันล่าสุดของทุกสคริปต์ · เทียบกับทะเบียนเมนู SML AI Account ทั้งหมด{data ? ` · อัปเดต ${fmtTime(data.generatedAt)}` : ""}</p>
        <button onClick={load} className="baseline-center ml-auto gap-1.5 rounded-xl border border-white/10 px-3 py-1 text-[0.78rem] text-slate-300 hover:border-white/25">
          <RefreshCw className="h-3.5 w-3.5" /> โหลดใหม่
        </button>
      </div>

      {err && <p className="mt-3 text-[0.8rem] text-rose-300">โหลดสรุปไม่สำเร็จ: {err}</p>}
      {data && v && (
        <div className={`mt-4 rounded-2xl border p-4 ${v.cls}`}>
          <p className="text-base font-bold">คำตัดสิน: {v.label}</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[0.8rem] leading-snug">
            {data.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-xl border px-3 py-1.5 text-[0.8rem] font-semibold ${tab === t.key ? "border-cyan-300/50 bg-cyan-400/10 text-cyan-100" : "border-white/10 text-slate-300 hover:border-white/25"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-full border px-3 py-0.5 text-[0.75rem] leading-5 ${filter === f.key ? "border-white/40 bg-white/10 text-white" : "border-white/10 text-slate-400 hover:border-white/25"}`}>
            {f.label} {f.key === "all" ? rows.all.length : n(f.key)}
          </button>
        ))}
        <label className="baseline-center ml-auto gap-1.5 rounded-xl border border-white/10 px-2.5 py-1 text-[0.78rem]">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อเมนู/รหัส" className="w-44 bg-transparent outline-none placeholder:text-slate-500" />
        </label>
      </div>

      <ul className="mt-3 max-h-[36rem] space-y-1.5 overflow-auto pr-1">
        {rows.shown.map((r, k) => (
          <React.Fragment key={r.id}>
            {(k === 0 || rows.shown[k - 1].group !== r.group) && <li className="pt-2 text-[0.75rem] font-bold text-slate-400">{r.group}</li>}
            <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <StatusBadge status={r.status === "untested" ? "pending" : r.status} label={r.status === "untested" ? "ยังไม่ทดสอบ" : undefined} />
                <span className="text-[0.85rem] font-semibold">{r.name}</span>
                <span className="font-mono text-[0.68rem] text-slate-500">{r.sub}</span>
                {r.runId && (
                  <button onClick={() => onOpenRun(r.runId!)} className="ml-auto text-[0.7rem] text-cyan-300 hover:underline">
                    รอบ {r.runId} · {fmtTime(r.at)}
                  </button>
                )}
              </div>
              {r.reason && <p className="mt-1 whitespace-pre-line break-words text-[0.75rem] leading-snug text-rose-200">ไม่ผ่านเพราะ: {r.reason}</p>}
            </li>
          </React.Fragment>
        ))}
        {data && !rows.shown.length && <li className="py-6 text-center text-[0.8rem] text-slate-500">ไม่มีรายการในตัวกรองนี้</li>}
      </ul>
    </section>
  );
};
