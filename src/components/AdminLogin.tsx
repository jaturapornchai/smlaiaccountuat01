"use client";

import React, { useEffect, useRef, useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { call } from "@/lib/http";

type Me = { email: string | null; clientId: string };
type Gis = {
  initialize: (c: { client_id: string; callback: (r: { credential?: string }) => void }) => void;
  renderButton: (el: HTMLElement, o: object) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: Gis } };
  }
}

// ผู้ดูแลเข้าสู่ระบบ Google เพื่อสั่งงานผ่านหน้าเว็บ — คนอื่นดูได้อย่างเดียว (ตรวจฝั่งเซิร์ฟเวอร์ที่ src/middleware.ts)
export function AdminLogin({ onAdmin, onError }: { onAdmin: (admin: boolean) => void; onError: (msg: string) => void }) {
  const [me, setMe] = useState<Me>();
  const btn = useRef<HTMLDivElement>(null);
  const cb = useRef({ onAdmin, onError });
  cb.current = { onAdmin, onError };

  useEffect(() => {
    call<Me>("/api/auth").then(setMe).catch((e) => cb.current.onError(e.message));
  }, []);
  useEffect(() => cb.current.onAdmin(!!me?.email), [me]);

  useEffect(() => {
    const el = btn.current;
    if (!me || me.email || !el) return;
    const render = () => {
      window.google!.accounts.id.initialize({
        client_id: me.clientId,
        callback: (r) => {
          if (r.credential) call<{ email: string }>("/api/auth", { credential: r.credential }).then((x) => setMe({ ...me, email: x.email })).catch((e) => cb.current.onError(e.message));
        },
      });
      window.google!.accounts.id.renderButton(el, { theme: "filled_black", size: "large", shape: "pill", text: "signin", locale: "th" });
    };
    if (window.google) return render();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [me]);

  if (me?.email)
    return (
      <span title={me.email} className="glass baseline-center h-[2.6rem] gap-2 rounded-xl px-3 text-xs font-semibold text-emerald-200">
        <ShieldCheck className="h-4 w-4" />
        <span className="hidden sm:inline">ผู้ดูแล</span>
        <button
          onClick={() => fetch("/api/auth", { method: "DELETE" }).then(() => setMe({ ...me, email: null }))}
          aria-label="ออกจากระบบ"
          title="ออกจากระบบ"
          className="text-slate-400 transition hover:text-white"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </span>
    );
  return <div ref={btn} title="ผู้ดูแลเข้าสู่ระบบเพื่อสั่งงาน (คนอื่นดูได้อย่างเดียว)" className="baseline-center h-[2.6rem]" />;
}
