"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, Copy, KeyRound, RadioTower } from "lucide-react";
import { McpTokensModal } from "./McpTokensModal";

const TOOLS = ["status", "scripts", "save_script", "run", "runs", "events", "notify"];

// การ์ดบอกวิธีเชื่อม AI ผ่าน MCP (src/app/api/mcp/route.ts) · ไม่แสดงค่า token จริง ใช้ <UAT_MCP_TOKEN> แทน
export const McpCard: React.FC<{ admin: boolean; say: (ok: boolean, text: string) => void }> = ({ admin, say }) => {
  const [url, setUrl] = useState("/api/mcp");
  const [copied, setCopied] = useState("");
  const [tokensOpen, setTokensOpen] = useState(false);
  useEffect(() => setUrl(`${location.origin}/api/mcp`), []);

  const antigravity = JSON.stringify({ mcpServers: { "uat-tester": { serverUrl: url, headers: { Authorization: "Bearer <UAT_MCP_TOKEN>" }, timeoutSeconds: 180 } } }, null, 2);
  const copy = (key: string, text: string) =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    });
  const CopyBtn = ({ k, text, label }: { k: string; text: string; label: string }) => (
    <button onClick={() => copy(k, text)} className="glass baseline-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.78rem] font-semibold text-cyan-100 transition hover:border-cyan-300/40">
      {copied === k ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
      {copied === k ? "คัดลอกแล้ว" : label}
    </button>
  );

  return (
    <section aria-label="เชื่อม AI ผ่าน MCP" className="glass flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl px-5 py-4">
      <span className="baseline-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-200">
          <RadioTower className="h-5 w-5" />
        </span>
        <span className="leading-tight">
          <span className="block font-bold">เชื่อม AI ผ่าน MCP</span>
          <span className="block text-[0.72rem] text-slate-400">Claude Code · Antigravity สั่งทดสอบเองได้</span>
        </span>
      </span>

      <span className="baseline-center min-w-0 flex-wrap gap-2 text-[0.8rem]">
        <code className="rounded-lg bg-black/40 px-2.5 py-1 font-mono text-cyan-200">{url}</code>
        <CopyBtn k="url" text={url} label="คัดลอก URL" />
        <CopyBtn k="ag" text={antigravity} label="คัดลอกค่าตั้ง Antigravity" />
      </span>

      <span className="text-[0.75rem] leading-relaxed text-slate-400">
        หัว <code className="font-mono text-slate-300">Authorization: Bearer &lt;UAT_MCP_TOKEN&gt;</code> · ขอ token จากผู้ดูแล
        <span className="mt-1 flex flex-wrap gap-1">
          {TOOLS.map((t) => (
            <span key={t} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.68rem] text-slate-300">
              {t}
            </span>
          ))}
        </span>
      </span>

      {admin && (
        <button onClick={() => setTokensOpen(true)} className="glass baseline-center ml-auto gap-1.5 rounded-xl px-3 py-1.5 text-[0.8rem] font-semibold text-amber-100 transition hover:border-amber-300/40">
          <KeyRound className="h-4 w-4" />
          จัดการ token
        </button>
      )}
      <Link href="/guide#mcp" className={`baseline-center ${admin ? "" : "ml-auto "}gap-1.5 text-[0.8rem] font-semibold text-cyan-200 hover:underline`}>
        <BookOpen className="h-4 w-4" />
        วิธีตั้งค่า
      </Link>
      {admin && <McpTokensModal open={tokensOpen} onClose={() => setTokensOpen(false)} onDone={say} />}
    </section>
  );
};
