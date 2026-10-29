"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { BotConfig, HealthReport, ScriptRun, SwarmSettings, UatScript } from "@/types/bot";
import { call } from "@/lib/http";
import { Navbar } from "@/components/Navbar";
import { HeroStats } from "@/components/HeroStats";
import { BotCard } from "@/components/BotCard";
import { ScriptLibrary } from "@/components/ScriptLibrary";
import { RunPanel } from "@/components/RunPanel";
import { BotConsoleModal } from "@/components/BotConsoleModal";
import { BroadcastModal } from "@/components/BroadcastModal";
import { SettingsModal } from "@/components/SettingsModal";
import { ActivityFx } from "@/components/ActivityFx";
import { McpCard } from "@/components/McpCard";
import { DeliveryReport } from "@/components/DeliveryReport";

type ScriptErr = { file: string; error: string };

export default function Home() {
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [runs, setRuns] = useState<ScriptRun[]>([]);
  const [scripts, setScripts] = useState<UatScript[]>([]);
  const [scriptErrors, setScriptErrors] = useState<ScriptErr[]>([]);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [settings, setSettings] = useState<SwarmSettings | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [consoleBotId, setConsoleBotId] = useState<string | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [admin, setAdmin] = useState(false); // ผู้ดูแลเข้าสู่ระบบ Google แล้ว = เห็นปุ่มสั่งงานบนแถบบน
  const say = useCallback((ok: boolean, text: string) => setToast({ ok, text }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([call<{ bots: BotConfig[] }>("/api/bots"), call<{ runs: ScriptRun[] }>("/api/runs")]);
      setBots(b.bots);
      setRuns(r.runs);
    } catch (e) {
      say(false, `โหลดข้อมูลไม่ได้: ${(e as Error).message}`);
    }
  }, [say]);

  const loadScripts = useCallback(async () => {
    try {
      const d = await call<{ scripts: UatScript[]; errors: ScriptErr[] }>("/api/scripts");
      setScripts(d.scripts);
      setScriptErrors(d.errors);
    } catch (e) {
      say(false, `อ่านสคริปต์ไม่ได้: ${(e as Error).message}`);
    }
  }, [say]);

  const checkHealth = useCallback(async () => {
    try {
      setHealth(await call<HealthReport>("/api/health"));
    } catch (e) {
      say(false, `ตรวจสถานะระบบไม่ได้: ${(e as Error).message}`);
    }
  }, [say]);

  useEffect(() => {
    refresh();
    loadScripts();
    checkHealth();
    call<{ settings: SwarmSettings }>("/api/settings").then((d) => setSettings(d.settings), () => {});
  }, [refresh, loadScripts, checkHealth]);

  const active = runs.filter((r) => r.status === "running" || r.status === "queued").length;
  const sending = runs.some((r) => r.issue?.status === "sending");
  useEffect(() => {
    const t = setInterval(refresh, active || sending ? 1500 : 5000);
    return () => clearInterval(t);
  }, [refresh, active, sending]);
  useEffect(() => {
    const t = setInterval(checkHealth, 30_000);
    return () => clearInterval(t);
  }, [checkHealth]);

  // บอทที่กำลังทำงานขึ้นก่อน แล้วเรียงตามเวลาทำงานล่าสุด (runs เรียงใหม่สุดก่อนอยู่แล้วจาก listRuns)
  const ordered = [...bots].sort(
    (a, b) => Number(b.status === "running") - Number(a.status === "running") || (b.stats.lastActive ?? "").localeCompare(a.stats.lastActive ?? "") || a.number - b.number,
  );

  const start = async (body: object) => {
    setBusy(true);
    try {
      const d = await call<{ runs: ScriptRun[]; unknown: string[] }>("/api/runs", body);
      say(true, `เข้าคิวแล้ว ${d.runs.length} สคริปต์${d.unknown?.length ? ` · ไม่พบ ${d.unknown.join(", ")}` : ""}`);
      if (d.runs[0]) setSelectedRunId(d.runs[0].id);
      await refresh();
    } catch (e) {
      say(false, (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stopRun = async (id: string) => {
    try {
      await call(`/api/runs/${id}`, { action: "stop" });
      await refresh();
    } catch (e) {
      say(false, (e as Error).message);
    }
  };

  const sendIssue = async (id: string) => {
    say(true, "สมอง AI กำลังวิเคราะห์และเปิด issue ใน IssueMate…");
    setTimeout(refresh, 300);
    try {
      const { run } = await call<{ run: ScriptRun }>(`/api/runs/${id}`, { action: "issuemate" });
      const i = run.issue;
      say(i?.status !== "error", i?.status === "sent" ? `เปิด issue ${i.code} แล้ว` : i?.status === "duplicate" ? `ไม่ส่งซ้ำ — ${i.message}` : `ส่งไม่สำเร็จ: ${i?.message}`);
    } catch (e) {
      say(false, (e as Error).message);
    }
    await refresh();
  };

  // แสงตามเมาส์บนการ์ด .spot
  const onPointerMove = (e: React.PointerEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".spot");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  const gap = "gap-[clamp(1rem,1.6vw,2.25rem)]";
  return (
    <>
      <Navbar
        target={settings?.erpTargetUrl ?? ""}
        health={health}
        activeRuns={active}
        busy={busy || !scripts.length}
        onRunAll={() => start({ all: true })}
        onBroadcast={() => setBroadcastOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        admin={admin}
        onAdmin={setAdmin}
        onError={(m) => say(false, m)}
      />

      <main onPointerMove={onPointerMove} className="mx-auto w-full max-w-[170rem] space-y-[clamp(1.5rem,2.6vw,3.5rem)] px-[clamp(1rem,2.2vw,3.5rem)] py-[clamp(1.25rem,2.6vw,3.5rem)]">
        <HeroStats bots={bots} scripts={scripts} runs={runs} />
        <DeliveryReport runs={runs} onOpenRun={setSelectedRunId} />
        <McpCard admin={admin} say={say} />

        <div className={`grid items-start ${gap} 2xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.42fr)]`}>
          <div className={`grid min-w-0 ${gap}`}>
            <section>
              <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-xl font-bold">ฝูงบอท {bots.length} ตัว · เรียงตามเวลาทำงานล่าสุด</h2>
                <p className="text-[0.8rem] text-slate-400">กดจอเพื่อดูทุกขั้นตอน · ▶ รันสคริปต์ของบอทนั้น · ✨ สั่งงาน: AI ({settings?.brainModel ?? "…"}) เขียนสคริปต์แล้วรันจริง</p>
              </div>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))]">
                {ordered.map((b, i) => {
                  const mine = runs.filter((r) => r.botId === b.id);
                  return (
                    <BotCard
                      key={b.id}
                      i={i}
                      bot={b}
                      run={mine.find((r) => r.status === "running") ?? mine.find((r) => r.startedAt)}
                      shot={mine.find((r) => r.liveAt)}
                      scriptCount={scripts.filter((s) => s.module === b.role && s.lens === b.lens).length}
                      onRun={(id) => start({ botIds: [id] })}
                      onOpen={setConsoleBotId}
                      onOpenRun={setSelectedRunId}
                    />
                  );
                })}
              </div>
            </section>
            <ScriptLibrary scripts={scripts} errors={scriptErrors} runs={runs} busy={busy} onRun={(ids) => start({ scriptIds: ids })} onReload={loadScripts} />
          </div>

          <div className="min-w-0 2xl:sticky 2xl:top-[5.5rem]">
            <RunPanel runs={runs} selectedId={selectedRunId} onSelect={setSelectedRunId} onStop={stopRun} onIssue={sendIssue} issueMateUrl={health?.issuemate.url} />
          </div>
        </div>
      </main>

      <BotConsoleModal
        bot={bots.find((b) => b.id === consoleBotId) ?? null}
        scripts={scripts}
        runs={runs}
        busy={busy}
        onClose={() => setConsoleBotId(null)}
        onRun={(id) => start({ botIds: [id] })}
        onOpenRun={(id) => {
          setSelectedRunId(id);
          setConsoleBotId(null);
        }}
        onAsked={refresh}
      />
      <BroadcastModal open={broadcastOpen} bots={bots} onClose={() => setBroadcastOpen(false)} onDone={refresh} />
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        health={health}
        onClose={() => setSettingsOpen(false)}
        onSaved={(s) => {
          setSettings(s);
          say(true, "บันทึกการตั้งค่าเรียบร้อย");
          checkHealth();
        }}
        onRecheck={checkHealth}
        onReset={async () => {
          try {
            await call("/api/bots", { action: "reset" });
            say(true, "รีเซ็ตสถานะบอททั้งหมดแล้ว");
            await refresh();
          } catch (e) {
            say(false, (e as Error).message);
          }
        }}
      />

      <ActivityFx onActivity={refresh} />

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4">
          <div role="status" className={`rise glass flex max-w-[40rem] items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold ${toast.ok ? "text-emerald-100" : "text-rose-100"}`}>
            {toast.ok ? <CircleCheck className="h-5 w-5 shrink-0 text-emerald-300" /> : <TriangleAlert className="h-5 w-5 shrink-0 text-rose-300" />}
            {toast.text}
          </div>
        </div>
      )}
    </>
  );
}
