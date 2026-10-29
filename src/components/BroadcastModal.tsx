"use client";

import React, { useState } from "react";
import { BrainCircuit, Send } from "lucide-react";
import { BotConfig } from "@/types/bot";
import { LENSES, MODULES } from "@/lib/swarm-data";
import { call } from "@/lib/http";
import { Modal } from "./Modal";

const PRESETS = [
  "ตรวจว่างบทดลองเดบิตเท่ากับเครดิต และหัวรายวันตรงกับผลรวมรายการ",
  "ตรวจยอดเอกสารขายและซื้อเทียบยอดที่ลงบัญชี GL ต้องตรงระดับสตางค์",
  "ตรวจภาษีขาย ภาษีซื้อ 7% ทุกเอกสาร และรายงานภาษีตรงกับเอกสาร",
];

type Target = { key: string; label: string; pick: (b: BotConfig) => boolean };
const TARGETS: Target[] = [
  { key: "auto", label: "ให้ระบบเลือกบอทเอง", pick: () => false },
  { key: "all", label: "ทุกตัว (30)", pick: () => true },
  ...LENSES.map((l) => ({ key: `lens:${l.key}`, label: `มุม${l.label}`, pick: (b: BotConfig) => b.lens === l.key })),
  ...MODULES.map((m) => ({ key: `mod:${m.role}`, label: m.roleTitle.replace(/^UAT /, ""), pick: (b: BotConfig) => b.role === m.role })),
];

interface Props {
  open: boolean;
  bots: BotConfig[];
  onClose: () => void;
  onSent: (ok: boolean, text: string) => void;
}

export const BroadcastModal: React.FC<Props> = ({ open, bots, onClose, onSent }) => {
  const [target, setTarget] = useState("auto");
  const [prompt, setPrompt] = useState("");
  const auto = target === "auto";
  const chosen = bots.filter(TARGETS.find((t) => t.key === target)!.pick);
  // กดแล้วปิดหน้าต่างทันที งานทำเบื้องหลังบนเซิร์ฟเวอร์ — ผลตามมาในฟีดกิจกรรม, ส่งไม่ถึงเซิร์ฟเวอร์ก็แจ้งเป็นข้อความเตือน
  const send = () => {
    call("/api/swarm/broadcast", { targetBotIds: auto ? [] : chosen.map((b) => b.id), prompt: prompt.trim(), taskTitle: prompt.trim().slice(0, 40) }).then(
      (d) => onSent(true, d.message || "รับคำสั่งแล้ว"),
      (e) => onSent(false, `สั่งงานไม่สำเร็จ: ${(e as Error).message}`),
    );
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} wide title="สั่งงานตรวจ · ระบบกระจายงานให้บอทเอง" icon={<BrainCircuit className="h-5 w-5 text-violet-300" />}>
      <div className="space-y-5">
        <section>
          <h3 className="text-[0.85rem] font-bold">ส่งถึง <span className="font-normal text-slate-400">({auto ? "AI เลือก 1–6 ตัวตามคำสั่ง" : `${chosen.length} ตัว`} · แต่ละตัวเขียนสคริปต์แล้วรันจริงกับเว็บ API และ PostgreSQL)</span></h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TARGETS.map((t) => (
              <button key={t.key} onClick={() => setTarget(t.key)} className={`rounded-full border px-3 py-1 text-[0.75rem] font-semibold transition ${target === t.key ? "border-violet-300/50 bg-violet-400/15 text-white" : "border-white/[0.08] text-slate-400 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p} onClick={() => setPrompt(p)} className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[0.7rem] text-slate-300 hover:border-violet-300/40 hover:text-white">
                {p}
              </button>
            ))}
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="สั่งว่าจะให้ตรวจอะไร เช่น ตรวจว่ายอดภาษีขายเดือนนี้ตรงกับยอดที่ลง GL" className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[0.85rem] outline-none focus:border-violet-300/50" />
          <div className="mt-2 flex items-center gap-3">
            <button onClick={send} disabled={!prompt.trim() || (!auto && !chosen.length)} className="btn-primary baseline-center ml-auto gap-2 rounded-xl px-4 py-2 text-[0.8rem] font-bold text-white">
              <Send className="h-4 w-4" />
              สั่งงาน
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
};
