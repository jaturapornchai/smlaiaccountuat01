"use client";

import React, { useMemo, useState } from "react";
import { Database, Play, RefreshCw, ScrollText, TriangleAlert } from "lucide-react";
import { ScriptRun, UatScript } from "@/types/bot";
import { LENSES, MODULES } from "@/lib/swarm-data";
import { StatusBadge } from "./StatusBadge";

const SEV: Record<string, string> = {
  S1: "text-rose-200 bg-rose-500/15 border-rose-400/30",
  S2: "text-amber-200 bg-amber-400/10 border-amber-300/30",
  S3: "text-sky-200 bg-sky-400/10 border-sky-300/30",
  S4: "text-slate-300 bg-slate-400/10 border-slate-300/20",
};

interface Props {
  scripts: UatScript[];
  errors: { file: string; error: string }[];
  runs: ScriptRun[];
  busy: boolean;
  onRun: (scriptIds: string[]) => void;
  onReload: () => void;
}

export const ScriptLibrary: React.FC<Props> = ({ scripts, errors, runs, busy, onRun, onReload }) => {
  const [filter, setFilter] = useState<string>("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = useMemo(() => scripts.filter((s) => filter === "all" || s.module === filter), [scripts, filter]);
  const lastRun = (id: string) => runs.find((r) => r.scriptId === id);
  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <section className="glass rounded-3xl p-5">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="baseline-center gap-2 text-lg font-bold">
          <ScrollText className="h-5 w-5 text-violet-300" />
          คลังสคริปต์ทดสอบ
          <span className="rounded-full bg-white/5 px-2 text-[0.75rem] font-semibold text-slate-400">{scripts.length}</span>
        </h2>
        <button onClick={onReload} title="อ่านไฟล์สคริปต์ใหม่" className="baseline-center h-8 w-8 justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white">
          <RefreshCw className="h-4 w-4" />
        </button>
        <div className="ml-auto flex gap-2">
          <button disabled={!picked.size || busy} onClick={() => { onRun([...picked]); setPicked(new Set()); }} className="btn-primary baseline-center gap-2 rounded-xl px-3.5 py-2 text-[0.8rem] font-bold text-white">
            <Play className="h-3.5 w-3.5 fill-current" />
            รันที่เลือก {picked.size ? `(${picked.size})` : ""}
          </button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {[{ role: "all", roleTitle: "ทั้งหมด", accent: "#94a3b8" }, ...MODULES].map((m) => (
          <button
            key={m.role}
            onClick={() => setFilter(m.role)}
            className={`rounded-full border px-3 py-1 text-[0.75rem] font-semibold transition ${filter === m.role ? "border-white/30 bg-white/10 text-white" : "border-white/[0.06] text-slate-400 hover:text-white"}`}
          >
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: m.accent }} />
            {m.roleTitle.replace(/^UAT /, "")}
          </button>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="mt-4 space-y-1 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-[0.78rem] text-rose-200">
          {errors.map((e) => (
            <div key={e.file} className="baseline-center gap-2">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              <b>{e.file}</b> {e.error}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))]">
        {shown.map((s, k) => {
          const mod = MODULES.find((m) => m.role === s.module)!;
          const last = lastRun(s.id);
          return (
            <label key={s.id} className={`spot rise relative flex cursor-pointer flex-col rounded-2xl border p-4 transition ${picked.has(s.id) ? "border-cyan-300/50 bg-cyan-400/[0.06]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/15"}`} style={{ "--i": k } as React.CSSProperties}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="mt-1 h-4 w-4 accent-cyan-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-[0.88rem] font-semibold leading-snug">{s.title}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.68rem]">
                    <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: `${mod.accent}1f`, color: mod.accent }}>{mod.roleTitle.replace(/^UAT /, "")}</span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-slate-300">{LENSES.find((l) => l.key === s.lens)?.label}</span>
                    <span className={`rounded-full border px-2 py-0.5 font-bold ${SEV[s.severityOnFail]}`} title="ระดับปัญหาถ้าไม่ผ่าน">{s.severityOnFail}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); onRun([s.id]); }}
                  disabled={busy}
                  title="รันสคริปต์นี้"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-200 transition hover:bg-cyan-400/25 disabled:opacity-40"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                </button>
              </div>
              <p className="mt-2 line-clamp-2 text-[0.75rem] leading-snug text-slate-400">{s.description}</p>
              <div className="mt-auto flex items-center gap-3 pt-3 text-[0.7rem] text-slate-400">
                <span>{s.stepCount} ขั้น{s.cleanupCount ? ` + เก็บกวาด ${s.cleanupCount}` : ""}</span>
                {s.usesDb && (
                  <span className="baseline-center gap-1 text-emerald-300/80">
                    <Database className="h-3 w-3" />
                    ตรวจ DB
                  </span>
                )}
                <span className="ml-auto">{last ? <StatusBadge status={last.status} /> : "ยังไม่เคยรัน"}</span>
              </div>
            </label>
          );
        })}
      </div>
    </section>
  );
};
