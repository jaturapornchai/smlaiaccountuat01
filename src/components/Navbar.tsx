"use client";

import React from "react";
import Link from "next/link";
import { BookOpen, Bot, Globe, Play, Settings, Sparkles } from "lucide-react";
import { HealthReport } from "@/types/bot";
import { host } from "@/lib/format";
import { AdminLogin } from "@/components/AdminLogin";

interface NavbarProps {
  target: string;
  health: HealthReport | null;
  activeRuns: number;
  busy: boolean;
  onRunAll: () => void;
  onBroadcast: () => void;
  onSettings: () => void;
  admin: boolean;
  onAdmin: (admin: boolean) => void;
  onError: (msg: string) => void;
}

const Dot: React.FC<{ label: string; check?: { ok: boolean; message: string } }> = ({ label, check }) => (
  <span title={check?.message ?? "กำลังตรวจ…"} className="baseline-center gap-1.5 text-[0.72rem] font-semibold text-slate-300">
    <span className={`h-2 w-2 rounded-full ${!check ? "bg-slate-500" : check.ok ? "bg-emerald-400 text-emerald-400 pulse-dot" : "bg-rose-500"}`} />
    {label}
  </span>
);

export const Navbar: React.FC<NavbarProps> = ({ target, health, activeRuns, busy, onRunAll, onBroadcast, onSettings, admin, onAdmin, onError }) => (
  <nav className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#050816]/70 backdrop-blur-xl">
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-[clamp(1rem,2.2vw,3.5rem)] py-3">
      <div className="baseline-center gap-3">
        <span className="ring-live relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500/25 to-violet-600/30">
          <Bot className="h-6 w-6 text-cyan-200" />
        </span>
        <span className="leading-tight">
          <span className="block text-lg font-extrabold tracking-tight">UAT Tester</span>
          <span className="block text-[0.72rem] text-slate-400">SML AI Account · ฝูงบอท 30 ตัว</span>
        </span>
      </div>

      <div className="glass order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-2 md:order-none md:w-auto">
        <span className="baseline-center gap-2 text-sm font-semibold" title="เว็บที่กำลังทดสอบ">
          <Globe className="h-4 w-4 text-cyan-300" />
          {host(target)}
        </span>
        <span className="h-4 w-px bg-white/10" />
        <Dot label="เว็บ ERP" check={health?.erp} />
        <Dot label="ฐาน Demo" check={health?.db} />
        <Dot label="สมอง AI" check={health?.brain} />
        <Dot label="IssueMate" check={health?.issuemate} />
        {activeRuns > 0 && (
          <span className="baseline-center gap-1.5 rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-[0.72rem] font-bold text-cyan-200">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 text-cyan-300 pulse-dot" />
            กำลังรัน {activeRuns}
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Link href="/guide" aria-label="คู่มือการใช้งาน" className="glass baseline-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/40">
          <BookOpen className="h-4 w-4 text-cyan-300" />
          <span className="hidden sm:inline">คู่มือ</span>
        </Link>
        {admin && (
          <>
            <button onClick={onRunAll} disabled={busy} className="btn-primary baseline-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white">
              <Play className="h-4 w-4 fill-current" />
              <span className="hidden sm:inline">รันทุกสคริปต์</span>
            </button>
            <button onClick={onBroadcast} className="glass baseline-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:border-violet-300/40">
              <Sparkles className="h-4 w-4 text-violet-300" />
              <span className="hidden sm:inline">สั่งงานตรวจ</span>
            </button>
            <button onClick={onSettings} aria-label="ตั้งค่า" className="glass baseline-center h-[2.6rem] w-[2.6rem] justify-center rounded-xl text-slate-300 transition hover:rotate-45 hover:text-white">
              <Settings className="h-5 w-5" />
            </button>
          </>
        )}
        <AdminLogin onAdmin={onAdmin} onError={onError} />
      </div>
    </div>
  </nav>
);
