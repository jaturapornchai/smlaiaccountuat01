"use client";

import React, { useEffect, useRef, useState } from "react";
import { Activity, Bot, CircleCheck, ListChecks, ScrollText } from "lucide-react";
import { BotConfig, ScriptRun, UatScript } from "@/types/bot";
import { SwarmCore } from "./SwarmCore";

// นับเลขขึ้นแบบลื่น ๆ ทุกครั้งที่ค่าเปลี่ยน
function useCountUp(value: number, ms = 900) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const v = Math.round(a + (value - a) * (1 - Math.pow(1 - p, 3)));
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

const Kpi: React.FC<{ i: number; icon: React.ReactNode; label: string; value: number; suffix?: string; sub: string; tone: string }> = ({ i, icon, label, value, suffix, sub, tone }) => {
  const n = useCountUp(value);
  return (
    <div className="glass spot rise rounded-2xl p-4" style={{ "--i": i } as React.CSSProperties}>
      <div className={`baseline-center gap-2 text-[0.78rem] font-semibold ${tone}`}>
        {icon}
        {label}
      </div>
      <div className="mt-2 text-[2.1rem] font-extrabold leading-none tabular-nums tracking-tight">
        {n.toLocaleString("th-TH")}
        {suffix && <span className="ml-1 text-lg text-slate-400">{suffix}</span>}
      </div>
      <div className="mt-2 truncate text-[0.75rem] text-slate-400">{sub}</div>
    </div>
  );
};

interface HeroProps {
  bots: BotConfig[];
  scripts: UatScript[];
  runs: ScriptRun[];
}

export const HeroStats: React.FC<HeroProps> = ({ bots, scripts, runs }) => {
  const active = runs.filter((r) => r.status === "running").length;
  const queued = runs.filter((r) => r.status === "queued").length;
  const done = runs.filter((r) => r.status === "passed" || r.status === "failed" || r.status === "error");
  const passed = done.filter((r) => r.status === "passed").length;
  const rate = done.length ? Math.round((passed / done.length) * 100) : 0;
  const steps = bots.reduce((a, b) => a + b.stats.stepsChecked, 0);
  const coveredBots = new Set(scripts.map((s) => `${s.module}:${s.lens}`)).size;

  return (
    <section className="grid items-center gap-[clamp(1rem,2vw,3rem)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div>
        <p className="rise baseline-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/5 px-3 py-1 text-[0.75rem] font-semibold text-cyan-200">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 text-cyan-300 pulse-dot" />
          ทดสอบของจริง · ไม่มีผลจำลอง
        </p>
        <h1 className="rise mt-4 text-[clamp(2rem,3.4vw,4.2rem)] font-extrabold leading-[1.15] tracking-tight" style={{ "--i": 1 } as React.CSSProperties}>
          <span className="text-shine">ทดสอบ ERP ทีละขั้นตอน</span>
          <br />
          หน้าจอ · API · PostgreSQL
        </h1>
        <p className="rise mt-4 max-w-[46rem] text-[0.95rem] leading-relaxed text-slate-400" style={{ "--i": 2 } as React.CSSProperties}>
          บอท 30 ตัวแบ่ง 10 โมดูล × 3 มุมตรวจ รันสคริปต์กับเว็บ UAT จริง ตรวจแถวในฐาน Demo หลังทุกการบันทึก ขั้นไหนพังจะเห็นค่าที่คาดหวังเทียบค่าจริงพร้อมภาพหลักฐานทันที
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <Kpi i={3} icon={<Bot className="h-4 w-4" />} label="บอททั้งหมด" value={bots.length} sub={`มีสคริปต์แล้ว ${coveredBots} ตัว`} tone="text-cyan-300" />
          <Kpi i={4} icon={<ScrollText className="h-4 w-4" />} label="สคริปต์ทดสอบ" value={scripts.length} sub={`${scripts.reduce((a, s) => a + s.stepCount, 0)} ขั้นตอน`} tone="text-violet-300" />
          <Kpi i={5} icon={<Activity className="h-4 w-4" />} label="กำลังรัน" value={active} sub={queued ? `รอคิวอีก ${queued}` : "ไม่มีคิวค้าง"} tone="text-sky-300" />
          <Kpi i={6} icon={<CircleCheck className="h-4 w-4" />} label="อัตราผ่าน" value={rate} suffix="%" sub={`ผ่าน ${passed} จาก ${done.length} รอบ`} tone="text-emerald-300" />
          <Kpi i={7} icon={<ListChecks className="h-4 w-4" />} label="ขั้นตอนที่ตรวจ" value={steps} sub="สะสมตั้งแต่เปิดเซิร์ฟเวอร์" tone="text-amber-300" />
        </div>
      </div>
      <div className="rise relative mx-auto aspect-square w-full max-w-[clamp(18rem,30vw,34rem)]" style={{ "--i": 3 } as React.CSSProperties}>
        <SwarmCore bots={bots} />
        <div className="absolute inset-x-0 -bottom-1 flex justify-center gap-4 text-[0.7rem] text-slate-400">
          <span>วงใน หน้าจอ</span>
          <span>วงกลาง ฐานข้อมูล</span>
          <span>วงนอก API</span>
        </div>
      </div>
    </section>
  );
};
