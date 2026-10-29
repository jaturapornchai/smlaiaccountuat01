"use client";

import React, { useState } from "react";
import { BrainCircuit, Bug, Camera, Check, Clock, ExternalLink, FileText, Loader2, Minus, Send, Square, Timer, X } from "lucide-react";
import { IssueLink, ScriptRun, StepResult } from "@/types/bot";
import { LENSES, MODULES } from "@/lib/swarm-data";
import { fmtDur, fmtSpan, fmtTime, host, kindLabel } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

const evidenceUrl = (runId: string, file: string) => `/api/runs/${runId}/evidence/${encodeURIComponent(file)}`;

const NODE: Record<StepResult["status"], { icon: React.ReactNode; cls: string }> = {
  pending: { icon: <Clock className="h-3 w-3" />, cls: "border-white/15 text-slate-500" },
  running: { icon: <Loader2 className="h-3 w-3 animate-spin" />, cls: "border-cyan-300 text-cyan-200 bg-cyan-400/15 shadow-[0_0_1rem_-0.2rem_#22d3ee]" },
  passed: { icon: <Check className="h-3 w-3" />, cls: "border-emerald-400/60 text-emerald-300 bg-emerald-400/10" },
  failed: { icon: <X className="h-3 w-3" />, cls: "border-rose-400 text-rose-200 bg-rose-500/20 shadow-[0_0_1rem_-0.2rem_#fb7185]" },
  skipped: { icon: <Minus className="h-3 w-3" />, cls: "border-white/10 text-slate-500" },
};

const Step: React.FC<{ run: ScriptRun; s: StepResult; onImage: (url: string) => void }> = ({ run, s, onImage }) => {
  const n = NODE[s.status];
  return (
    <li className="slide-in relative pl-9">
      <span className={`absolute left-0 top-0.5 grid h-6 w-6 place-items-center rounded-full border ${n.cls}`}>{n.icon}</span>
      <div className="flex items-baseline gap-2">
        <span className={`min-w-0 flex-1 text-[0.82rem] font-semibold leading-snug ${s.status === "skipped" || s.status === "pending" ? "text-slate-500" : ""}`}>
          {s.i + 1}. {s.title}
        </span>
        <span className="shrink-0 rounded-md bg-white/5 px-1.5 text-[0.65rem] text-slate-400">{kindLabel(s.kind)}</span>
        {s.durationMs !== undefined && <span className="shrink-0 text-[0.65rem] tabular-nums text-slate-500">{fmtDur(s.durationMs)}</span>}
      </div>
      {s.detail && <p className={`mt-0.5 break-words text-[0.72rem] leading-snug ${s.status === "failed" ? "text-rose-200" : "text-slate-400"}`}>{s.detail}</p>}
      {s.status === "failed" && (s.expected !== undefined || s.actual !== undefined) && (
        <div className="mt-1.5 grid gap-1.5 text-[0.7rem] sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-2 py-1">
            <span className="text-emerald-300">คาดหวัง</span> <span className="break-words font-mono text-slate-200">{s.expected ?? "-"}</span>
          </div>
          <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1">
            <span className="text-rose-300">ค่าจริง</span> <span className="break-words font-mono text-slate-200">{s.actual ?? "-"}</span>
          </div>
        </div>
      )}
      {s.evidence &&
        (s.evidence.endsWith(".png") ? (
          <button onClick={() => onImage(evidenceUrl(run.id, s.evidence!))} className="group mt-1.5 block overflow-hidden rounded-lg border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={evidenceUrl(run.id, s.evidence)} alt={`ภาพหลักฐานขั้น ${s.i + 1}`} loading="lazy" className="h-24 w-auto object-cover transition group-hover:scale-105" />
          </button>
        ) : (
          <a href={evidenceUrl(run.id, s.evidence)} target="_blank" rel="noreferrer" className="baseline-center mt-1 gap-1 text-[0.7rem] text-cyan-300 hover:underline">
            <FileText className="h-3 w-3" />
            ดูหลักฐาน {s.evidence}
          </a>
        ))}
    </li>
  );
};

interface Props {
  runs: ScriptRun[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStop: (id: string) => void;
  onIssue: (id: string) => void;
  issueMateUrl?: string;
}

// ผลการส่งเข้า IssueMate ของรอบที่ไม่ผ่าน + บทวิเคราะห์จากสมอง AI
const IssueBox: React.FC<{ run: ScriptRun; url?: string; onSend: () => void }> = ({ run, url, onSend }) => {
  const i: IssueLink | undefined = run.issue;
  const sendBtn = (label: string) => (
    <button onClick={onSend} className="baseline-center gap-1.5 rounded-xl border border-violet-300/30 bg-violet-500/15 px-3 py-1.5 text-[0.75rem] font-semibold text-violet-100 hover:bg-violet-500/25">
      <Send className="h-3.5 w-3.5" />
      {label}
    </button>
  );
  return (
    <div className="mt-3 rounded-2xl border border-violet-300/20 bg-violet-500/[0.06] p-3 text-[0.75rem]">
      <div className="flex flex-wrap items-center gap-2">
        <Bug className="h-4 w-4 text-violet-300" />
        <span className="font-bold text-violet-100">IssueMate</span>
        {!i && <span className="text-slate-400">ยังไม่ได้ส่ง</span>}
        {i?.status === "sending" && (
          <span className="baseline-center gap-1.5 text-violet-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            สมอง AI กำลังวิเคราะห์และเปิด issue…
          </span>
        )}
        {(i?.status === "sent" || i?.status === "duplicate") && (
          <a href={url} target="_blank" rel="noreferrer" className="baseline-center gap-1 rounded-full bg-violet-400/20 px-2.5 py-0.5 font-bold text-violet-50 hover:bg-violet-400/30">
            {i.code}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {i?.status === "duplicate" && <span className="text-slate-400">ซ้ำกับที่ส่งไปแล้ว ไม่เปิดใหม่</span>}
        {i?.status === "error" && <span className="text-rose-200">{i.message}</span>}
        <span className="ml-auto">{(!i || i.status === "error") && sendBtn(i ? "ส่งใหม่" : "ส่งเข้า IssueMate")}</span>
      </div>
      {i?.analysis && (
        <details className="mt-2">
          <summary className="baseline-center cursor-pointer gap-1.5 font-semibold text-violet-200">
            <BrainCircuit className="h-3.5 w-3.5" />
            บทวิเคราะห์จากสมอง AI (คาดเดา ต้องตรวจโค้ดจริง)
          </summary>
          <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-slate-300">{i.analysis}</p>
        </details>
      )}
    </div>
  );
};

export const RunPanel: React.FC<Props> = ({ runs, selectedId, onSelect, onStop, onIssue, issueMateUrl }) => {
  const [image, setImage] = useState<string | null>(null);
  const run = runs.find((r) => r.id === selectedId) ?? runs[0];
  const main = run?.steps.filter((s) => !s.cleanup) ?? [];
  const tail = run?.steps.filter((s) => s.cleanup) ?? [];
  const doneSteps = run?.steps.filter((s) => s.status !== "pending" && s.status !== "running").length ?? 0;

  return (
    <section className="glass flex max-h-[calc(100vh-7rem)] min-h-[28rem] flex-col overflow-hidden rounded-3xl">
      <header className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
        <Timer className="h-5 w-5 text-cyan-300" />
        <h2 className="text-lg font-bold">รอบการรัน</h2>
        <span className="rounded-full bg-white/5 px-2 text-[0.75rem] font-semibold text-slate-400">{runs.length}</span>
      </header>

      {!run ? (
        <div className="grid flex-1 place-items-center p-8 text-center text-sm text-slate-400">ยังไม่มีการรัน — กด ▶ ที่บอทหรือสคริปต์ เพื่อเริ่มทดสอบ</div>
      ) : (
        <>
          <div className="max-h-[32%] shrink-0 overflow-y-auto border-b border-white/10 p-2">
            {runs.map((r) => {
              const mod = MODULES.find((m) => m.role === r.module);
              const total = r.steps.length || 1;
              const done = r.steps.filter((s) => s.status !== "pending" && s.status !== "running").length;
              return (
                <button key={r.id} onClick={() => onSelect(r.id)} className={`relative w-full overflow-hidden rounded-xl px-3 py-2 text-left transition ${r.id === run.id ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: mod?.accent }} />
                    <span className="min-w-0 flex-1 truncate text-[0.8rem] font-semibold">{r.scriptTitle}</span>
                    {r.issue?.code && <span className="rounded-full bg-violet-400/15 px-1.5 text-[0.62rem] font-bold text-violet-200">{r.issue.code}</span>}
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-0.5 flex gap-2 pl-4 text-[0.68rem] text-slate-500">
                    <span>{fmtTime(r.startedAt ?? r.queuedAt)}</span>
                    <span className="text-emerald-300/80">ผ่าน {r.passed || r.steps.filter((s) => s.status === "passed").length}</span>
                    <span className={r.failed ? "text-rose-300" : ""}>ไม่ผ่าน {r.failed || r.steps.filter((s) => s.status === "failed").length}</span>
                  </div>
                  {r.status === "running" && (
                    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/5">
                      <div className="h-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all duration-500" style={{ width: `${(done / total) * 100}%` }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-[0.98rem] font-bold leading-snug">{run.scriptTitle}</h3>
                <p className="mt-1 text-[0.7rem] text-slate-400">
                  {MODULES.find((m) => m.role === run.module)?.roleTitle.replace(/^UAT /, "")} · {LENSES.find((l) => l.key === run.lens)?.label ?? ""} · {host(run.target)} · {fmtTime(run.startedAt)} · ใช้เวลา {fmtSpan(run.startedAt, run.finishedAt)}
                </p>
              </div>
              {(run.status === "running" || run.status === "queued") && (
                <button onClick={() => onStop(run.id)} className="baseline-center gap-1.5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[0.75rem] font-semibold text-rose-200 hover:bg-rose-500/20">
                  <Square className="h-3 w-3 fill-current" />
                  หยุด
                </button>
              )}
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className={`h-full rounded-full transition-all duration-500 ${run.status === "failed" || run.status === "error" ? "bg-rose-400" : "bg-gradient-to-r from-cyan-400 via-indigo-400 to-violet-500"}`} style={{ width: `${run.steps.length ? (doneSteps / run.steps.length) * 100 : run.status === "queued" ? 0 : 100}%` }} />
            </div>
            {run.message && <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/5 px-3 py-2 text-[0.75rem] text-amber-100">{run.message}</p>}
            {(run.status === "failed" || run.status === "error") && <IssueBox run={run} url={issueMateUrl} onSend={() => onIssue(run.id)} />}
            {run.issues > 0 && <p className="mt-2 text-[0.72rem] text-amber-200">ตัวตรวจจับเจอ HTTP ผิดพลาด / JS error / ข้อความ DB error รวม {run.issues} ครั้งระหว่างรัน</p>}

            <ol className="relative mt-5 space-y-4 before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-white/10">
              {main.map((s) => <Step key={s.i} run={run} s={s} onImage={setImage} />)}
            </ol>
            {tail.length > 0 && (
              <>
                <div className="my-4 flex items-center gap-2 text-[0.7rem] font-semibold text-slate-400">
                  <span className="h-px flex-1 bg-white/10" />
                  ขั้นเก็บกวาด (รันเสมอ)
                  <span className="h-px flex-1 bg-white/10" />
                </div>
                <ol className="space-y-4">{tail.map((s) => <Step key={s.i} run={run} s={s} onImage={setImage} />)}</ol>
              </>
            )}
            {run.steps.some((s) => s.evidence?.endsWith(".png")) && (
              <p className="baseline-center mt-5 gap-1.5 text-[0.68rem] text-slate-500">
                <Camera className="h-3 w-3" />
                คลิกภาพเพื่อขยาย · ไฟล์อยู่ที่ runs/{run.id}/
              </p>
            )}
          </div>
        </>
      )}

      {image && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-6 backdrop-blur" onClick={() => setImage(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="ภาพหลักฐานขยาย" className="rise max-h-full max-w-full rounded-2xl border border-white/10 shadow-2xl" />
        </div>
      )}
    </section>
  );
};

