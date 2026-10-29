"use client";

import React from "react";
import { MonitorPlay, Play, Sparkles } from "lucide-react";
import { BotConfig, ScriptRun } from "@/types/bot";
import { fmtAgo, kindLabel } from "@/lib/format";
import { BotIcon } from "./BotIcon";
import { StatusBadge } from "./StatusBadge";

interface BotCardProps {
  i: number;
  bot: BotConfig;
  run?: ScriptRun; // รอบที่กำลังรัน หรือรอบล่าสุดของบอทนี้
  shot?: ScriptRun; // รอบล่าสุดที่มีภาพหน้าจอสด (runs/<id>/live.jpg)
  scriptCount: number;
  onRun: (botId: string) => void;
  onOpen: (botId: string) => void;
  onOpenRun: (runId: string) => void;
}

// การ์ดบอท 1 ตัว: จอสดว่ากำลังทำอะไร + เวลาทำงานล่าสุด
export const BotCard: React.FC<BotCardProps> = ({ i, bot, run, shot, scriptCount, onRun, onOpen, onOpenRun }) => {
  const live = bot.status === "running";
  const step = live ? run?.steps.find((s) => s.status === "running") : undefined;
  const doing = step
    ? `ขั้น ${step.i + 1}/${run!.steps.length} · ${kindLabel(step.kind)} · ${step.title}`
    : (bot.taskHistory[0]?.result ?? (scriptCount ? `สคริปต์ ${scriptCount} ชุด พร้อมรัน` : "ยังไม่มีสคริปต์ · สั่งบอท AI สำรวจได้"));
  const no = `#${String(bot.number).padStart(2, "0")}`;

  return (
    <article className={`glass spot rise flex flex-col overflow-hidden rounded-3xl transition duration-300 hover:-translate-y-0.5 ${live ? "ring-live" : ""}`} style={{ "--i": i, "--c": bot.accent } as React.CSSProperties}>
      <button onClick={() => run && onOpenRun(run.id)} disabled={!run} title={run ? "ดูทุกขั้นตอนของรอบนี้" : undefined} className="relative block aspect-video w-full overflow-hidden bg-black/50 text-left">
        {shot?.liveAt ? (
          <img src={`/api/runs/${shot.id}/evidence/live.jpg?t=${encodeURIComponent(shot.liveAt)}`} alt={`หน้าจอล่าสุดของบอท ${no}`} loading="lazy" className="h-full w-full object-cover object-top" />
        ) : (
          <span className="grid h-full place-items-center px-6 text-center text-[0.75rem] text-slate-500">
            <span>
              <MonitorPlay className="mx-auto mb-2 h-7 w-7 opacity-60" style={{ color: bot.accent }} />
              {live ? "กำลังทำงาน · ขั้นนี้ไม่มีหน้าจอ (SQL/API)" : bot.lens === "data" ? "บอทนี้ตรวจผ่าน SQL · ไม่มีหน้าจอ" : "ยังไม่มีภาพหน้าจอ"}
            </span>
          </span>
        )}
        {live && (
          <span className="baseline-center absolute left-2 top-2 gap-1.5 rounded-full bg-rose-500/90 px-2 py-0.5 text-[0.65rem] font-bold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            สด
          </span>
        )}
        <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[0.65rem] text-slate-200">{fmtAgo(bot.stats.lastActive)}</span>
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-6 text-[0.72rem] text-slate-100">{doing}</span>
        {live && <span className="shimmer absolute inset-x-0 bottom-0 h-0.5" style={{ backgroundColor: `${bot.accent}88` }} />}
      </button>

      <div className="flex items-center gap-3 px-3.5 pt-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${bot.accent}22`, color: bot.accent }}>
          <BotIcon name={bot.avatarIcon} className="h-[1.1rem] w-[1.1rem]" />
        </span>
        <button onClick={() => onOpen(bot.id)} className="min-w-0 flex-1 text-left" title="ดูรายละเอียดบอท">
          <span className="baseline-center gap-2 text-[0.88rem] font-bold">
            <span className="truncate">{bot.roleTitle.replace(/^UAT /, "")}</span>
            <span className="text-[0.68rem] font-medium text-slate-500">{no}</span>
          </span>
        </button>
        <StatusBadge status={bot.status} />
      </div>

      <div className="flex items-center gap-2 px-3.5 pb-3.5 pt-2 text-[0.7rem]">
        <BotIcon name={bot.lens} className="h-3.5 w-3.5 text-slate-500" />
        {bot.stats.passed + bot.stats.failed > 0 ? (
          <span className="text-slate-400">
            <span className="font-bold text-emerald-300">ผ่าน {bot.stats.passed}</span> · <span className={bot.stats.failed ? "font-bold text-rose-300" : ""}>ไม่ผ่าน {bot.stats.failed}</span>
          </span>
        ) : (
          <span className="text-slate-500">ยังไม่มีผลทดสอบ</span>
        )}
        <span className="flex-1" />
        <button
          onClick={() => onRun(bot.id)}
          disabled={!scriptCount || live}
          title={scriptCount ? `รันสคริปต์ ${scriptCount} ชุด` : "ยังไม่มีสคริปต์ของมุมตรวจนี้"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-200 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
        </button>
        <button onClick={() => onOpen(bot.id)} title="สั่งบอท AI สำรวจเพิ่ม" className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-400/10 text-violet-200 transition hover:bg-violet-400/25">
          <Sparkles className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
};
