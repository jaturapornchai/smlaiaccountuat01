"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, MonitorPlay, Play, Sparkles, X } from "lucide-react";
import { BotConfig, ScriptRun } from "@/types/bot";
import { fmtAgo, kindLabel } from "@/lib/format";
import { BotIcon } from "./BotIcon";
import { StatusBadge } from "./StatusBadge";

interface BotCardProps {
  i: number;
  bot: BotConfig;
  run?: ScriptRun; // รอบที่กำลังรัน หรือรอบล่าสุดของบอทนี้ — ภาพ คำสั่ง และข้อความบนจอมาจากรอบนี้รอบเดียว
  queued: number; // สคริปต์ของบอทนี้ที่ยังรอคิว
  scriptCount: number;
  onRun: (botId: string) => void;
  onOpen: (botId: string) => void;
  onOpenRun: (runId: string) => void;
}

type Summary = { done: boolean; ok?: boolean; why: string };

// สรุปให้คนอ่านรู้ทันที: "จบงาน" = บอทไม่มีอะไรต้องทำต่อในรอบนี้ · "รอขั้นตอนต่อไป" = ยังมีขั้น/คิวค้าง หรือรอคนตัดสินใจ
function summarize(run: ScriptRun | undefined, live: boolean, queued: number): Summary | undefined {
  if (live && run) {
    const left = run.steps.filter((s) => s.status === "pending").length;
    return { done: false, why: `กำลังทดสอบ · เหลืออีก ${left} ขั้น${queued ? ` · จบแล้วต่อด้วยสคริปต์ในคิวอีก ${queued} ชุด` : ""}` };
  }
  const wait = `สคริปต์รอคิวอีก ${queued} ชุด · รอช่องรันว่าง`;
  if (!run) return queued ? { done: false, why: wait } : undefined;
  const s = finished(run);
  return queued ? { done: false, ok: s.ok, why: `รอบล่าสุด: ${s.why} · ${wait}` } : s;
}

function finished(run: ScriptRun): Summary {
  const i = run.issue;
  if (run.status === "passed") return { done: true, ok: true, why: `ผ่านครบ ${run.passed} ขั้น · ไม่มีงานค้าง` };
  if (run.status === "stopped") return { done: true, why: "ถูกสั่งหยุดกลางทาง · กด ▶ ถ้าจะรันใหม่" };
  if (run.status === "error") return { done: false, ok: false, why: `ตัวรันขัดข้อง${run.message ? `: ${run.message}` : ""} · ${run.retryOf ? "ลองซ้ำแล้วยังขัดข้อง · Tester รันใหม่เองตอนเซิร์ฟเวอร์เริ่มครั้งหน้า" : "Tester ลองรันใหม่เอง 1 ครั้ง"}` };
  if (i?.code && (i.status === "sent" || i.status === "duplicate")) return { done: true, ok: false, why: `ไม่ผ่าน · ${i.status === "sent" ? "เปิด" : "ต่อท้ายใน"} ${i.code} แล้ว · ต่อที่ IssueMate: ทีมพัฒนาแก้แล้วสั่งตรวจซ้ำ หรือปิดถ้าสคริปต์ผิดเอง` };
  if (i?.status === "sending") return { done: false, ok: false, why: "ไม่ผ่าน · กำลังส่งเรื่องเข้า IssueMate" };
  if (i?.status === "error") return { done: false, ok: false, why: "ไม่ผ่าน · ส่ง IssueMate ไม่สำเร็จ · กดส่งใหม่ที่หน้ารอบนี้" };
  if (run.retired) return { done: true, ok: false, why: "ไม่ผ่านเพราะสคริปต์ที่ AI เสนอพังเอง · AI ซ่อมไม่ได้ ปลดสคริปต์ออกจากคลังแล้ว · ไม่มีงานค้าง" };
  return { done: false, ok: false, why: `ไม่ผ่าน · ไม่เปิด ticket: ${run.noIssue ?? "ยังไม่ได้ส่ง · Tester กำลังตรวจก่อนเปิด ticket (ถ้าปิดส่ง IssueMate อัตโนมัติไว้ กด \"ส่งเข้า IssueMate\" ที่หน้ารอบนี้)"}` };
}

// การ์ดบอท 1 ตัว: จอสดว่ากำลังทำอะไร + เวลาทำงานล่าสุด
export const BotCard: React.FC<BotCardProps> = ({ i, bot, run, queued, scriptCount, onRun, onOpen, onOpenRun }) => {
  const live = bot.status === "running";
  const step = live ? run?.steps.find((s) => s.status === "running") : undefined;
  const failed = live ? undefined : run?.steps.find((s) => s.status === "failed");
  const n = run?.steps.length ?? 0;
  const doing = step
    ? `ขั้น ${step.i + 1}/${n} · ${kindLabel(step.kind)} · ${step.title}`
    : run && !live
      ? failed
        ? `ไม่ผ่านขั้น ${failed.i + 1}/${n} · ${failed.title}`
        : `${run.status === "passed" ? `ผ่านครบ ${run.passed} ขั้น` : "รอบนี้ไม่จบ"} · ${run.scriptTitle}`
      : (bot.taskHistory[0]?.result ?? (scriptCount ? `สคริปต์ ${scriptCount} ชุด พร้อมรัน` : "ยังไม่มีสคริปต์ · สั่งบอท AI สำรวจได้"));
  const no = `#${String(bot.number).padStart(2, "0")}`;
  // จอเล่าขั้นเดียว: ขณะรัน = ขั้นที่กำลังทำ, จบแล้ว = ขั้นที่ไม่ผ่าน หรือขั้นสุดท้ายที่รันจริง (ไม่นับเก็บกวาด)
  // ขั้นนั้นเป็น SQL/API → โชว์คำสั่งจริง, ไม่งั้นโชว์ live.jpg ของรอบนี้ (ไม่หยิบภาพรอบเก่า — ภาพหลังล็อกอินไม่ใช่สิ่งที่ตรวจ)
  const focus = step ?? failed ?? run?.steps.findLast((s) => s.status === "passed" && !s.cleanup);
  const q = focus?.query ? focus : undefined;
  const hasScreen = Boolean(q || run?.liveAt);
  const sum = summarize(run, live, queued);
  const tone = !sum?.done ? "border-amber-300/25 bg-amber-400/10 text-amber-200" : sum.ok ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200" : sum.ok === false ? "border-rose-400/25 bg-rose-500/10 text-rose-200" : "border-slate-400/20 bg-slate-500/10 text-slate-200";

  // ซูมจอ: ขยายออกจากตำแหน่งการ์ด (x,y = กลางการ์ดบนจอ, s = สัดส่วนการ์ดต่อความกว้างจอ) · out = กำลังหดกลับก่อนปิด
  const [zoom, setZoom] = useState<{ x: number; y: number; s: number; out?: boolean } | null>(null);
  const shotRef = useRef<HTMLDivElement>(null);
  const openZoom = () => {
    const r = shotRef.current?.getBoundingClientRect();
    if (r) setZoom({ x: r.left + r.width / 2, y: r.top + r.height / 2, s: r.width / window.innerWidth });
  };
  const closeZoom = () => setZoom((z) => z && { ...z, out: true });
  const zoomed = zoom !== null;
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeZoom();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  // big = จอที่ซูม: เห็นทั้งภาพ (ไม่ครอป) และเลื่อนอ่านคำสั่งยาวได้
  const screen = (big: boolean) =>
    q ? (
      <span className={`block h-full px-3 pb-8 pt-9 font-mono leading-relaxed text-emerald-200/90 ${big ? "overflow-auto text-sm" : "overflow-hidden text-[0.68rem]"}`}>
        <span className={`mb-1 block font-sans text-slate-400 ${big ? "text-xs" : "text-[0.65rem]"}`}>{q.kind.startsWith("db.") ? "คำสั่ง SQL" : "คำขอ API"} · ขั้น {q.i + 1}</span>
        <span className="block whitespace-pre-wrap break-words">{q.query}</span>
      </span>
    ) : run?.liveAt ? (
      <img src={`/api/runs/${run.id}/evidence/live.jpg?t=${encodeURIComponent(run.liveAt)}`} alt={`หน้าจอล่าสุดของบอท ${no}`} loading={big ? undefined : "lazy"} className={`h-full w-full ${big ? "object-contain" : "object-cover object-top"}`} />
    ) : (
      <span className="grid h-full place-items-center px-6 text-center text-[0.75rem] text-slate-500">
        <span>
          <MonitorPlay className="mx-auto mb-2 h-7 w-7 opacity-60" style={{ color: bot.accent }} />
          {live ? "กำลังทำงาน · ขั้นนี้ไม่มีหน้าจอ (SQL/API)" : bot.lens === "data" ? "บอทนี้ตรวจผ่าน SQL · ไม่มีหน้าจอ" : "ยังไม่มีภาพหน้าจอ"}
        </span>
      </span>
    );
  const liveBadge = live && (
    <span className="baseline-center absolute left-2 top-2 gap-1.5 rounded-full bg-rose-500/90 px-2 py-0.5 text-[0.65rem] font-bold text-white">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      สด
    </span>
  );

  return (
    <article className={`glass spot rise flex flex-col overflow-hidden rounded-3xl transition duration-300 hover:-translate-y-0.5 ${live ? "ring-live" : ""}`} style={{ "--i": i, "--c": bot.accent } as React.CSSProperties}>
      <div ref={shotRef} className="relative">
        <button onClick={() => run && onOpenRun(run.id)} disabled={!run} title={run ? "ดูทุกขั้นตอนของรอบนี้" : undefined} className="relative block aspect-video w-full overflow-hidden bg-black/50 text-left">
          {screen(false)}
          {liveBadge}
          <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-6 text-[0.72rem] text-slate-100">{doing}</span>
          {live && <span className="shimmer absolute inset-x-0 bottom-0 h-0.5" style={{ backgroundColor: `${bot.accent}88` }} />}
        </button>
        <span className="absolute right-2 top-2 flex items-center gap-1.5">
          <span className="pointer-events-none rounded-full bg-black/60 px-2 py-0.5 text-[0.65rem] text-slate-200">{fmtAgo(bot.stats.lastActive)}</span>
          {hasScreen && (
            <button onClick={openZoom} title="ขยายจอ" aria-label={`ขยายจอบอท ${no}`} className="grid h-6 w-6 place-items-center rounded-full bg-black/60 text-slate-200 transition hover:scale-110 hover:bg-black/80 hover:text-white">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>

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

      {sum && (
        <p className={`mx-3.5 mt-2.5 flex items-baseline gap-2 rounded-xl border px-2.5 py-1.5 text-[0.7rem] leading-snug ${tone}`}>
          <span className="shrink-0 font-bold">{sum.done ? "จบงาน" : "รอขั้นตอนต่อไป"}</span>
          <span className="line-clamp-2 text-slate-300" title={sum.why}>{sum.why}</span>
        </p>
      )}

      <div className="flex items-center gap-2 px-3.5 pb-3.5 pt-2 text-[0.7rem]">
        <BotIcon name={bot.lens} className="h-3.5 w-3.5 text-slate-500" />
        {bot.stats.passed + bot.stats.failed > 0 ? (
          <span className="text-slate-400">
            <span className="font-bold text-emerald-300">ผ่าน {bot.stats.passed} รอบ</span> · <span className={bot.stats.failed ? "font-bold text-rose-300" : ""}>ไม่ผ่าน {bot.stats.failed} รอบ</span>
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

      {zoom &&
        createPortal(
          <div className={`fixed inset-0 z-50 ${zoom.out ? "zoom-out" : ""}`} style={{ "--zx": `${zoom.x}px`, "--zy": `${zoom.y}px`, "--zs": zoom.s } as React.CSSProperties}>
            <div className="zoom-fade absolute inset-0 bg-[#02030a]/80 backdrop-blur-md" />
            <div
              className="zoom-pop absolute inset-0 grid place-items-center p-4"
              onMouseDown={(e) => e.target === e.currentTarget && closeZoom()}
              onAnimationEnd={(e) => e.target === e.currentTarget && zoom.out && setZoom(null)}
            >
              <figure role="dialog" aria-modal aria-label={`หน้าจอบอท ${no}`} className="relative aspect-video w-[min(96vw,calc(90vh*16/9))] overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/15">
                {screen(true)}
                {liveBadge}
                <figcaption className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 to-transparent px-4 pb-3 pt-8 text-sm text-slate-100">
                  {bot.roleTitle.replace(/^UAT /, "")} {no} · {doing}
                </figcaption>
                <button onClick={closeZoom} aria-label="ปิด" className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-slate-200 transition hover:bg-black/80 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </figure>
            </div>
          </div>,
          document.body,
        )}
    </article>
  );
};
