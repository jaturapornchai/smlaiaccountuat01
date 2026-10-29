"use client";

import React, { useState } from "react";
import { BrainCircuit, Loader2, Play, Send } from "lucide-react";
import { BotConfig, ScriptRun, UatScript } from "@/types/bot";
import { LENSES, MODULES } from "@/lib/swarm-data";
import { call } from "@/lib/http";
import { fmtTime } from "@/lib/format";
import { BotIcon } from "./BotIcon";
import { Modal } from "./Modal";
import { StatusBadge } from "./StatusBadge";

const PRESETS = [
  "ตรวจยอดหัวเอกสารเทียบผลรวมรายการ ต้องตรงกันระดับสตางค์",
  "หาเอกสารที่ลงบัญชีแล้วแต่ไม่มีรายการ GL หรือ GL เดบิตไม่เท่าเครดิต",
  "ตรวจรหัสซ้ำ ข้อมูลกำพร้า และภาษี 7% ที่คำนวณไม่ตรง",
];

const EVENT_TONE: Record<string, string> = { pass: "text-emerald-300", fail: "text-rose-300", error: "text-rose-300", skip: "text-slate-500", info: "text-slate-300" };

interface Props {
  bot: BotConfig | null;
  scripts: UatScript[];
  runs: ScriptRun[];
  busy: boolean;
  onClose: () => void;
  onRun: (botId: string) => void;
  onOpenRun: (runId: string) => void;
  onAsked: () => void;
}

export const BotConsoleModal: React.FC<Props> = ({ bot, scripts, runs, busy, onClose, onRun, onOpenRun, onAsked }) => {
  const [prompt, setPrompt] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  if (!bot) return null;

  const mod = MODULES.find((m) => m.role === bot.role)!;
  const mine = scripts.filter((s) => s.module === bot.role && s.lens === bot.lens);
  const myRuns = runs.filter((r) => r.botId === bot.id).slice(0, 8);

  const ask = async () => {
    if (!prompt.trim()) return;
    setAsking(true);
    setError("");
    try {
      await call(`/api/bots/${bot.id}`, { action: "execute", prompt: prompt.trim() });
      setPrompt("");
      onAsked();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`#${String(bot.number).padStart(2, "0")} ${bot.name}`}
      icon={
        <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${mod.accent}22`, color: mod.accent }}>
          <BotIcon name={bot.avatarIcon} className="h-5 w-5" />
        </span>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-6">
          <section>
            <div className="flex items-center gap-2">
              <StatusBadge status={bot.status} />
              <span className="text-[0.78rem] text-slate-400">
                มุมตรวจ {LENSES.find((l) => l.key === bot.lens)?.label} · รัน {bot.stats.runs} รอบ · ผ่าน {bot.stats.passed} · ไม่ผ่าน {bot.stats.failed}
              </span>
            </div>
            <p className="mt-2 text-[0.82rem] leading-relaxed text-slate-300">{bot.roleDescription}</p>
            <p className="mt-2 rounded-xl bg-white/[0.03] px-3 py-2 text-[0.75rem] leading-relaxed text-slate-400">{bot.focus}</p>
          </section>

          <section>
            <div className="flex items-center gap-2">
              <h3 className="flex-1 font-bold">สคริปต์ของบอทนี้ ({mine.length})</h3>
              <button onClick={() => onRun(bot.id)} disabled={!mine.length || busy || bot.status === "running"} className="btn-primary baseline-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.78rem] font-bold text-white">
                <Play className="h-3.5 w-3.5 fill-current" />
                รันทั้งหมด
              </button>
            </div>
            {mine.length ? (
              <ul className="mt-2 space-y-1.5">
                {mine.map((s) => (
                  <li key={s.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[0.8rem]">
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-[0.7rem] text-slate-500">
                      {s.stepCount} ขั้น · ระดับถ้าไม่ผ่าน {s.severityOnFail} · uat-scripts/{s.id}.json
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[0.78rem] text-slate-400">ยังไม่มีสคริปต์ของมุมตรวจนี้ — เพิ่มไฟล์ .json ใน uat-scripts/ (module “{bot.role}”, lens “{bot.lens}”) หรือถามสมอง AI ให้ช่วยวางแผนก่อน</p>
            )}
          </section>

          {myRuns.length > 0 && (
            <section>
              <h3 className="font-bold">รอบการรันล่าสุด</h3>
              <ul className="mt-2 space-y-1">
                {myRuns.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => onOpenRun(r.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.78rem] hover:bg-white/[0.05]">
                      <span className="min-w-0 flex-1 truncate">{r.scriptTitle}</span>
                      {r.issue?.code && <span className="rounded-full bg-violet-400/15 px-1.5 text-[0.62rem] font-bold text-violet-200">{r.issue.code}</span>}
                      <span className="text-[0.68rem] text-slate-500">{fmtTime(r.startedAt ?? r.queuedAt)}</span>
                      <StatusBadge status={r.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <details className="text-[0.75rem]">
            <summary className="cursor-pointer font-semibold text-slate-400">คำสั่งระบบของบอท (system prompt)</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-black/30 p-3 font-sans leading-relaxed text-slate-400">{bot.systemPrompt}</pre>
          </details>
        </div>

        <div className="space-y-6">
          <section>
            <h3 className="baseline-center gap-2 font-bold">
              <BrainCircuit className="h-4 w-4 text-violet-300" />
              สั่งงานบอทนี้ <span className="font-normal text-slate-400">· AI เขียนสคริปต์แล้วรันจริง</span>
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p} onClick={() => setPrompt(p)} className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[0.7rem] text-slate-300 hover:border-violet-300/40 hover:text-white">
                  {p}
                </button>
              ))}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && ask()}
              rows={3}
              placeholder="พิมพ์ว่าจะให้ตรวจอะไร (Ctrl+Enter เพื่อส่ง)"
              className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[0.85rem] outline-none focus:border-violet-300/50"
            />
            <div className="mt-2 flex items-center gap-3">
              {error && <span className="flex-1 text-[0.75rem] text-rose-300">{error}</span>}
              <button onClick={ask} disabled={asking || !prompt.trim()} className="btn-primary baseline-center ml-auto gap-2 rounded-xl px-4 py-2 text-[0.8rem] font-bold text-white">
                {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {asking ? "AI กำลังเขียนสคริปต์…" : "สั่งงาน"}
              </button>
            </div>
          </section>

          <section>
            <h3 className="font-bold">ประวัติงาน</h3>
            {bot.taskHistory.length ? (
              <ul className="mt-2 space-y-2">
                {bot.taskHistory.map((t) => (
                  <li key={t.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <div className="flex items-center gap-2 text-[0.78rem]">
                      <span className="min-w-0 flex-1 truncate font-semibold">{t.kind === "agent" ? "✨ " : "▶ "}{t.title}</span>
                      <span className="text-[0.68rem] text-slate-500">{fmtTime(t.finishedAt ?? t.startedAt)}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    {t.prompt && <p className="mt-1 text-[0.72rem] text-slate-500">ถาม: {t.prompt}</p>}
                    {t.result && <p className={`mt-1 whitespace-pre-wrap text-[0.78rem] leading-relaxed ${t.status === "error" ? "text-rose-200" : "text-slate-300"}`}>{t.result}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[0.78rem] text-slate-400">ยังไม่มีงาน</p>
            )}
          </section>

          {bot.events.length > 0 && (
            <section>
              <h3 className="font-bold">เหตุการณ์ล่าสุด</h3>
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl bg-black/25 p-3 font-mono text-[0.7rem]">
                {[...bot.events].reverse().slice(0, 80).map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span className="shrink-0 text-slate-600">{fmtTime(e.timestamp)}</span>
                    <span className={`break-words ${EVENT_TONE[e.type]}`}>{e.content}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
};
