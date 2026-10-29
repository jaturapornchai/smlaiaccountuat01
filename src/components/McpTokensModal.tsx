"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { call } from "@/lib/http";
import { fmtAgo } from "@/lib/format";
import { Modal } from "./Modal";

interface Token {
  id: string;
  name: string;
  hint: string;
  createdAt: string;
  lastUsedAt?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: (ok: boolean, text: string) => void;
}

// หน้าจอสร้าง/ยกเลิก MCP token (ผู้ดูแล) · ค่า token จริงโชว์ครั้งเดียวหลังสร้าง เซิร์ฟเวอร์เก็บแค่ hash
export const McpTokensModal: React.FC<Props> = ({ open, onClose, onDone }) => {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [envToken, setEnvToken] = useState(false);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      call<{ tokens: Token[]; envToken: boolean }>("/api/mcp-tokens")
        .then((d) => {
          setTokens(d.tokens);
          setEnvToken(d.envToken);
        })
        .catch((e) => onDone(false, e.message)),
    [onDone],
  );
  useEffect(() => {
    if (open) load();
    else setFresh(null); // ปิดหน้าต่างแล้วลบค่า token ออกจากจอ
  }, [open, load]);

  const act = async (body: object) => {
    setBusy(true);
    try {
      const d = await call<{ token?: string; item?: Token }>("/api/mcp-tokens", body);
      if (d.token && d.item) {
        setFresh({ name: d.item.name, token: d.token });
        setName("");
      }
      onDone(true, d.message ?? "เรียบร้อย");
      await load();
    } catch (e) {
      onDone(false, e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = () =>
    fresh &&
    navigator.clipboard.writeText(fresh.token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  return (
    <Modal open={open} onClose={onClose} title="MCP token" icon={<KeyRound className="h-5 w-5 text-cyan-300" />}>
      <div className="space-y-5 px-6 py-5 text-[0.9rem]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act({ action: "create", name });
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="ชื่อ token เช่น Antigravity" className="glass min-w-0 flex-1 rounded-xl px-3 py-2 outline-none focus:border-cyan-300/50" />
          <button disabled={busy || !name.trim()} className="btn-primary baseline-center gap-1.5 rounded-xl px-4 py-2 font-bold text-white">
            <Plus className="h-4 w-4" />
            สร้าง token
          </button>
        </form>

        {fresh && (
          <div className="rounded-2xl border border-amber-300/40 bg-amber-300/10 p-4">
            <p className="font-bold text-amber-100">token &quot;{fresh.name}&quot; · คัดลอกเก็บไว้ตอนนี้ ปิดหน้าต่างแล้วจะไม่แสดงอีก</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-black/50 px-3 py-2 font-mono text-[0.78rem] text-cyan-100">{fresh.token}</code>
              <button onClick={copy} className="glass baseline-center gap-1.5 rounded-xl px-3 py-2 text-[0.8rem] font-semibold text-cyan-100">
                {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                {copied ? "คัดลอกแล้ว" : "คัดลอก"}
              </button>
            </div>
            <p className="mt-2 text-[0.75rem] text-slate-300">ใส่ในค่าตั้ง MCP ของ AI ที่หัว Authorization: Bearer &lt;token&gt;</p>
          </div>
        )}

        <ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08]">
          {envToken && (
            <li className="baseline-center gap-3 px-4 py-3 text-slate-400">
              <KeyRound className="h-4 w-4 shrink-0" />
              <span className="flex-1">token หลักในไฟล์ .env.local ของเซิร์ฟเวอร์ (เปลี่ยนที่เซิร์ฟเวอร์เท่านั้น)</span>
            </li>
          )}
          {tokens.map((t) => (
            <li key={t.id} className="baseline-center gap-3 px-4 py-3">
              <KeyRound className="h-4 w-4 shrink-0 text-cyan-300" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{t.name}</span> <span className="font-mono text-[0.75rem] text-slate-500">…{t.hint}</span>
                <span className="block text-[0.72rem] text-slate-400">
                  สร้าง{fmtAgo(t.createdAt)} · {t.lastUsedAt ? `ใช้ล่าสุด${fmtAgo(t.lastUsedAt)}` : "ยังไม่เคยใช้"}
                </span>
              </span>
              <button
                onClick={() => confirm(`ยกเลิก token "${t.name}"? AI ที่ใช้ token นี้จะเชื่อมไม่ได้ทันที`) && act({ action: "revoke", id: t.id })}
                disabled={busy}
                className="baseline-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.78rem] font-semibold text-rose-200 transition hover:bg-rose-500/15"
              >
                <Trash2 className="h-4 w-4" />
                ยกเลิก
              </button>
            </li>
          ))}
          {!tokens.length && <li className="px-4 py-3 text-slate-500">ยังไม่มี token ที่สร้างจากหน้าเว็บ</li>}
        </ul>
      </div>
    </Modal>
  );
};
