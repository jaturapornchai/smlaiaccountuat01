import React from "react";
import { BotStatus, RunStatus, StepStatus } from "@/types/bot";

type AnyStatus = BotStatus | RunStatus | StepStatus;

const MAP: Record<AnyStatus, { label: string; cls: string; live?: boolean }> = {
  idle: { label: "พร้อม", cls: "text-slate-300 bg-slate-500/10 border-slate-400/20" },
  running: { label: "กำลังทดสอบ", cls: "text-cyan-300 bg-cyan-400/10 border-cyan-300/30", live: true },
  completed: { label: "เสร็จแล้ว", cls: "text-emerald-300 bg-emerald-400/10 border-emerald-300/30" },
  error: { label: "ผิดพลาด", cls: "text-rose-300 bg-rose-500/10 border-rose-400/30" },
  paused: { label: "พัก", cls: "text-amber-300 bg-amber-400/10 border-amber-300/30" },
  queued: { label: "รอคิว", cls: "text-amber-300 bg-amber-400/10 border-amber-300/30", live: true },
  passed: { label: "ผ่าน", cls: "text-emerald-300 bg-emerald-400/10 border-emerald-300/30" },
  failed: { label: "ไม่ผ่าน", cls: "text-rose-300 bg-rose-500/10 border-rose-400/30" },
  stopped: { label: "หยุดแล้ว", cls: "text-slate-300 bg-slate-500/10 border-slate-400/20" },
  pending: { label: "รอ", cls: "text-slate-400 bg-slate-500/5 border-slate-400/15" },
  skipped: { label: "ข้าม", cls: "text-slate-400 bg-slate-500/5 border-slate-400/15" },
};

export const StatusBadge: React.FC<{ status: AnyStatus; label?: string }> = ({ status, label }) => {
  const m = MAP[status] ?? MAP.idle;
  return (
    <span className={`baseline-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold leading-5 ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${m.live ? "pulse-dot" : ""}`} />
      {label ?? m.label}
    </span>
  );
};
