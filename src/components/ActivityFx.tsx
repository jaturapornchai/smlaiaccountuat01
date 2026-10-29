"use client";

import React, { useEffect, useRef, useState } from "react";
import { BadgeCheck, CircleCheckBig, CircleX, MessageSquareText, PartyPopper, RadioTower, Siren, Ticket, Trophy } from "lucide-react";
import type { Activity, AiLink } from "@/lib/activity";

// แอนิเมชันสด: คำสั่งจาก AI ผ่าน MCP, ผลรันแต่ละสคริปต์, issue ที่เปิด, จบชุดทดสอบ, แก้สำเร็จหลังตรวจซ้ำ
type Card = { key: number; e: Activity; leaving?: boolean };
type Burst = { key: number; kind: "command" | "alarm" | "glow"; deg?: number; len?: number };
type Banner = { key: number; e: Activity; party: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#f8fafc"];

function ago(iso?: string) {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} วินาทีที่แล้ว` : s < 3600 ? `${Math.round(s / 60)} นาทีที่แล้ว` : `${Math.round(s / 3600)} ชั่วโมงที่แล้ว`;
}

function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n}</>;
}

const Confetti = React.memo(function Confetti() {
  const bits = useRef(
    Array.from({ length: 90 }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      "--dx": `${(Math.random() - 0.5) * 30}vw`,
      "--r": `${(Math.random() - 0.5) * 1440}deg`,
      "--t": `${2.2 + Math.random() * 1.8}s`,
      "--d": `${Math.random() * 0.6}s`,
      background: COLORS[i % COLORS.length],
      width: `${0.35 + Math.random() * 0.4}rem`,
    })),
  ).current;
  return (
    <>
      {bits.map((s, i) => (
        <span key={i} className="fx-confetti" style={s as React.CSSProperties} />
      ))}
    </>
  );
});

function look(e: Activity): { icon: React.ReactNode; tone: string; color: string; head: string } {
  if (e.kind === "mcp") return { icon: <RadioTower className="h-5 w-5" />, tone: "text-cyan-100", color: "#22d3ee", head: `คำสั่งเข้าจาก ${e.client ?? "AI"}` };
  if (e.kind === "note") return e.status === "error" ? { icon: <Siren className="h-5 w-5" />, tone: "text-rose-100", color: "#fb7185", head: `${e.client ?? "AI"} แจ้งปัญหา` } : { icon: <MessageSquareText className="h-5 w-5" />, tone: "text-sky-100", color: "#38bdf8", head: `${e.client ?? "AI"} แจ้งว่า` };
  if (e.kind === "issue")
    return e.status === "sent"
      ? { icon: <Ticket className="h-5 w-5" />, tone: "text-violet-100", color: "#a78bfa", head: `เปิด issue ${e.code} ส่งให้ทีมแก้แล้ว` }
      : e.status === "duplicate"
        ? { icon: <Ticket className="h-5 w-5" />, tone: "text-slate-200", color: "#94a3b8", head: `ปัญหาเดิม ${e.code ?? ""} — ไม่เปิดซ้ำ` }
        : { icon: <Siren className="h-5 w-5" />, tone: "text-rose-100", color: "#fb7185", head: "ส่งเข้า IssueMate ไม่สำเร็จ" };
  if (e.kind === "fixed") return { icon: <BadgeCheck className="h-5 w-5" />, tone: "text-emerald-100", color: "#34d399", head: `${e.code} แก้สำเร็จ ตรวจซ้ำผ่าน` };
  if (e.status === "passed") return { icon: <CircleCheckBig className="h-5 w-5" />, tone: "text-emerald-100", color: "#34d399", head: `ผ่าน · ${e.passed} ขั้น` };
  if (e.status === "failed") return { icon: <CircleX className="h-5 w-5" />, tone: "text-rose-100", color: "#fb7185", head: `ไม่ผ่าน · พัง ${e.failed} ขั้น` };
  return { icon: <Siren className="h-5 w-5" />, tone: "text-amber-100", color: "#fbbf24", head: e.status === "stopped" ? "หยุดรอบนี้แล้ว" : "รันผิดพลาด" };
}

export function ActivityFx({ onActivity }: { onActivity: () => void }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [link, setLink] = useState<AiLink | null>(null);
  const [hit, setHit] = useState(0);
  const [, tick] = useState(0);
  const cb = useRef(onActivity);
  cb.current = onActivity;

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000); // อัปเดต "x วินาทีที่แล้ว"
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const ctl = new AbortController();
    let after = -1;
    let k = 0;

    const later = (ms: number, fn: () => void) => setTimeout(() => alive && fn(), ms);
    const card = (e: Activity) => {
      const key = ++k;
      setCards((c) => [...c.slice(-4), { key, e }]);
      later(7000, () => setCards((c) => c.map((x) => (x.key === key ? { ...x, leaving: true } : x))));
      later(7500, () => setCards((c) => c.filter((x) => x.key !== key)));
    };
    const burst = (kind: Burst["kind"]) => {
      const key = ++k;
      const w = window.innerWidth / 2;
      const h = window.innerHeight / 2;
      setBursts((b) => [...b, { key, kind, deg: (Math.atan2(h, w) * 180) / Math.PI, len: Math.hypot(w, h) }]);
      later(1800, () => setBursts((b) => b.filter((x) => x.key !== key)));
    };
    const show = (e: Activity, party: boolean) => {
      const key = ++k;
      setBanner({ key, e, party });
      later(party ? 6500 : 5500, () => setBanner((b) => (b?.key === key ? null : b)));
    };

    const play = (events: Activity[]) => {
      for (const e of events.slice(-6)) {
        if (e.kind === "mcp" || e.kind === "note") {
          setHit((h) => h + 1);
          burst("command");
          card(e);
        } else if (e.kind === "run") {
          if (e.status === "failed" || e.status === "error") burst("alarm");
          else if (e.status === "passed") burst("glow");
          card(e);
        } else if (e.kind === "issue") card(e);
        else if (e.kind === "fixed") {
          show(e, true);
          card(e);
        } else if (e.kind === "batch" && (e.passed ?? 0) + (e.failed ?? 0) > 1) show(e, !e.failed);
      }
    };

    (async () => {
      while (alive) {
        try {
          const res = await fetch(`/api/activity?after=${Math.max(after, 0)}&wait=${after < 0 ? 0 : 25}`, { cache: "no-store", signal: ctl.signal });
          const d = await res.json();
          if (!res.ok || d.success === false) throw new Error(d.message);
          setLink(d.link);
          if (after >= 0 && d.events.length) {
            play(d.events);
            cb.current();
          }
          after = d.seq;
        } catch {
          if (!alive) return;
          await sleep(4000);
        }
      }
    })();
    return () => {
      alive = false;
      ctl.abort();
    };
  }, []);

  const live = link && Date.now() - new Date(link.at).getTime() < 120_000;
  const b = banner?.e;
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[65] overflow-hidden">
        {bursts.map((x) =>
          x.kind === "command" ? (
            <React.Fragment key={x.key}>
              <div className="fx-sweep" />
              <div className="fx-beam" style={{ "--deg": `${x.deg}deg`, width: `${x.len}px` } as React.CSSProperties} />
              <div className="fx-ring" />
              <div className="fx-ring" style={{ animationDelay: "0.25s" }} />
            </React.Fragment>
          ) : (
            <div key={x.key} className={x.kind === "alarm" ? "fx-edge fx-alarm" : "fx-edge fx-glow"} />
          ),
        )}
        {banner?.party && <Confetti key={banner.key} />}
      </div>

      {banner && b && (
        <div className="fixed inset-0 z-[66] grid place-items-center px-4" onClick={() => setBanner(null)}>
          <div key={banner.key} className="fx-banner glass relative w-full max-w-[34rem] overflow-hidden rounded-[2rem] px-8 py-9 text-center shadow-2xl">
            <div className={`fx-halo ${banner.party ? "bg-emerald-400/30" : "bg-rose-500/25"}`} />
            <span className={`relative mx-auto grid h-20 w-20 place-items-center rounded-full ${banner.party ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>
              {b.kind === "fixed" ? <PartyPopper className="h-10 w-10" /> : banner.party ? <Trophy className="h-10 w-10" /> : <Siren className="h-10 w-10" />}
            </span>
            <h2 className="text-shine relative mt-5 text-[clamp(1.8rem,3vw,2.6rem)] font-extrabold leading-tight">
              {b.kind === "fixed" ? "แก้สำเร็จ!" : banner.party ? "ผ่านทั้งหมด!" : "พบจุดผิดพลาด"}
            </h2>
            {b.kind === "fixed" ? (
              <p className="relative mt-3 text-[0.95rem] text-slate-200">{b.text}</p>
            ) : (
              <>
                <div className="relative mt-5 flex justify-center gap-10 text-[0.8rem] text-slate-400">
                  <span>
                    <b className="block text-4xl font-extrabold text-emerald-300">
                      <CountUp to={b.passed ?? 0} />
                    </b>
                    ผ่าน
                  </span>
                  <span>
                    <b className="block text-4xl font-extrabold text-rose-300">
                      <CountUp to={b.failed ?? 0} />
                    </b>
                    ไม่ผ่าน
                  </span>
                </div>
                <p className="relative mt-4 text-[0.8rem] text-slate-400">{banner.party ? "จบชุดทดสอบ ไม่มีอะไรต้องแก้" : "รอบที่ไม่ผ่านส่งเข้า IssueMate ให้ทีมแก้ แล้ว AI จะสั่งตรวจซ้ำ"}</p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed right-[clamp(1rem,2.2vw,3.5rem)] top-[5.75rem] z-[67] flex w-[min(27rem,92vw)] flex-col gap-2.5">
        {cards.map(({ key, e, leaving }) => {
          const l = look(e);
          return (
            <div key={key} className={`fx-card pointer-events-auto ${leaving ? "out" : ""}`} onClick={() => setCards((c) => c.filter((x) => x.key !== key))}>
              <div className={`${e.kind === "run" && e.status === "failed" ? "fx-shake" : ""} fx-holo glass relative overflow-hidden rounded-2xl px-4 py-3`} style={{ "--c": l.color } as React.CSSProperties}>
                <div className="fx-shine" />
                <div className="relative flex items-start gap-3">
                  <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${l.color}22`, color: l.color }}>
                    {l.icon}
                    {(e.kind === "fixed" || e.status === "passed" || e.kind === "mcp") &&
                      Array.from({ length: 10 }, (_, i) => <span key={i} className="fx-spark" style={{ "--a": `${i * 36}deg` } as React.CSSProperties} />)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[0.85rem] font-bold ${l.tone}`}>
                      {l.head}
                      {e.tool && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 align-middle font-mono text-[0.65rem] font-semibold text-slate-300">{e.tool}</span>}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[0.78rem] leading-relaxed text-slate-300">{e.text}</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`glass fixed bottom-5 left-5 z-[64] flex items-center gap-3 rounded-2xl px-3.5 py-2.5 ${live ? "ring-live" : ""}`} key={hit} title="ช่องทางที่ Claude / Antigravity สั่งงานผ่าน MCP">
        <span className={`fx-hud grid h-9 w-9 place-items-center rounded-xl ${live ? "bg-cyan-400/15 text-cyan-200" : "bg-white/5 text-slate-500"}`}>
          <RadioTower className="h-5 w-5" />
        </span>
        <span className="leading-tight">
          <span className="baseline-center gap-1.5 text-[0.78rem] font-bold">
            <span className={`h-2 w-2 rounded-full ${live ? "pulse-dot bg-emerald-400 text-emerald-400" : "bg-slate-600"}`} />
            {link ? `${link.client} ${live ? "เชื่อมต่ออยู่" : "เงียบไป"}` : "รอคำสั่งจาก AI ผ่าน MCP"}
          </span>
          <span className="block text-[0.68rem] text-slate-400">{link ? `คำสั่งล่าสุด ${link.tool} · ${ago(link.at)}` : "Claude · Antigravity"}</span>
        </span>
      </div>
    </>
  );
}
