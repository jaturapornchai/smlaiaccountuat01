"use client";

import React, { useEffect, useState } from "react";
import { Loader2, RefreshCw, RotateCcw, Save, Settings } from "lucide-react";
import { HealthCheck, HealthReport, SwarmSettings } from "@/types/bot";
import { call } from "@/lib/http";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  settings: SwarmSettings | null;
  health: HealthReport | null;
  onClose: () => void;
  onSaved: (s: SwarmSettings) => void;
  onRecheck: () => Promise<void>;
  onReset: () => Promise<void>;
}

const Row: React.FC<{ label: string; check?: HealthCheck }> = ({ label, check }) => (
  <li className="flex items-start gap-3 py-2">
    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${!check ? "bg-slate-500" : check.ok ? "bg-emerald-400" : "bg-rose-500"}`} />
    <span className="w-24 shrink-0 font-semibold">{label}</span>
    <span className="min-w-0 flex-1 break-words text-slate-400">{check?.message ?? "กำลังตรวจ…"}</span>
  </li>
);

// รุ่นตามงาน · ค่าแนะนำ = ค่าเริ่มต้นใน DEFAULT_MODELS (lib/brain.ts) ที่วัดกับงานจริงแล้ว
const MODEL_FIELDS = [
  ["brainModel", "รุ่น AI งานเร็ว (เลือกบอท · กดหน้าจอแทนคน)", "deepseek-v4.1-flash"],
  ["scriptModel", "รุ่น AI เขียนสคริปต์ตรวจ", "mistral-large-4"],
  ["analystModel", "รุ่น AI วิเคราะห์ก่อนเปิด issue", "mistral-large-4"],
  ["eyesModel", "รุ่น AI ดูภาพหน้าจอ (ui.see · ui.play)", "kimi-k3"],
] as const;
const field = "mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[0.85rem] outline-none focus:border-cyan-300/50";

export const SettingsModal: React.FC<Props> = ({ open, settings, health, onClose, onSaved, onRecheck, onReset }) => {
  const [form, setForm] = useState<SwarmSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(settings);
      setError("");
    }
  }, [open, settings]);

  if (!open || !form) return null;
  const set = <K extends keyof SwarmSettings>(k: K, v: SwarmSettings[K]) => setForm({ ...form, [k]: v });

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const d = await call<{ settings: SwarmSettings }>("/api/settings", form);
      onSaved(d.settings);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="ตั้งค่า" icon={<Settings className="h-5 w-5 text-cyan-300" />}>
      <div className="space-y-6 text-[0.85rem]">
        <section className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="font-semibold">เว็บ ERP ที่ทดสอบ</span>
            <input value={form.erpTargetUrl} onChange={(e) => set("erpTargetUrl", e.target.value)} className={field} placeholder="https://www.smlwork.com" />
          </label>
          {MODEL_FIELDS.map(([k, label, hint]) => (
            <label key={k}>
              <span className="font-semibold">{label}</span>
              <input value={form[k]} onChange={(e) => set(k, e.target.value)} className={field} placeholder={hint} />
              <span className="mt-1 block text-[0.7rem] text-slate-500">ชื่อรุ่นบน Ollama Cloud · แนะนำ {hint}</span>
            </label>
          ))}
          <label>
            <span className="font-semibold">รันพร้อมกันสูงสุด (บอท)</span>
            <input type="number" min={1} max={10} value={form.maxParallelBots} onChange={(e) => set("maxParallelBots", Number(e.target.value))} className={field} />
          </label>
          <label className="baseline-center gap-2.5">
            <input type="checkbox" checked={form.autoIssueMate} onChange={(e) => set("autoIssueMate", e.target.checked)} className="h-4 w-4 accent-violet-400" />
            ส่งรอบที่ไม่ผ่านเข้า IssueMate อัตโนมัติ
          </label>
          <label className="baseline-center gap-2.5">
            <input type="checkbox" checked={form.autoScripts} onChange={(e) => set("autoScripts", e.target.checked)} className="h-4 w-4 accent-violet-400" />
            จบชุดทดสอบแล้วให้ AI คิดสคริปต์ทดสอบเพิ่มเอง
          </label>
          <label className="baseline-center gap-2.5">
            <input type="checkbox" checked={form.headed} onChange={(e) => set("headed", e.target.checked)} className="h-4 w-4 accent-cyan-400" />
            เปิดหน้าต่าง Chrome ให้เห็นตอนรัน
          </label>
        </section>

        <p className="rounded-xl border border-amber-300/20 bg-amber-400/5 px-3 py-2 text-[0.75rem] leading-relaxed text-amber-100">
          คีย์ Ollama, token IssueMate และรหัสฐานข้อมูล Demo ตั้งใน <code>.env.local</code> เท่านั้น (ไม่แสดงในหน้านี้) — แก้แล้วต้องรีสตาร์ทเซิร์ฟเวอร์
        </p>

        <section>
          <div className="flex items-center gap-2">
            <h3 className="flex-1 font-bold">สถานะระบบ</h3>
            <button
              onClick={async () => {
                setChecking(true);
                await onRecheck();
                setChecking(false);
              }}
              className="baseline-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.75rem] text-slate-300 hover:bg-white/10"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
              ตรวจใหม่
            </button>
          </div>
          <ul className="mt-1 divide-y divide-white/[0.06] text-[0.78rem]">
            <Row label="เว็บ ERP" check={health?.erp} />
            <Row label="ฐาน Demo" check={health?.db} />
            <Row label="สมอง AI" check={health?.brain} />
            <Row label="IssueMate" check={health?.issuemate} />
          </ul>
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
          <button
            onClick={() => window.confirm("ล้างสถิติ ประวัติงาน และเหตุการณ์ของบอททั้ง 30 ตัว? (ผลการรันใน runs/ ยังอยู่)") && onReset()}
            className="baseline-center gap-1.5 rounded-xl border border-rose-400/30 px-3 py-2 text-[0.78rem] font-semibold text-rose-200 hover:bg-rose-500/10"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            รีเซ็ตบอท
          </button>
          {error && <span className="flex-1 text-[0.75rem] text-rose-300">{error}</span>}
          <button onClick={save} disabled={saving} className="btn-primary baseline-center ml-auto gap-2 rounded-xl px-4 py-2 text-[0.8rem] font-bold text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            บันทึก
          </button>
        </div>
      </div>
    </Modal>
  );
};
