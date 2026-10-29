import { pushActivity } from "./activity";
import { writeLog } from "./log";
import { Env, NightSummary, loadState, saveState, summarize, tick } from "./nightly";
import { getSettings } from "./swarm-store";

// ต่อสายรอบกลางคืนเข้ากับระบบจริง · ตรรกะ/ตัวตรวจอยู่ใน nightly.ts + scripts/check-nightly.mjs
// ตัวตั้งเวลา = setInterval ในโปรเซสนี้ (เริ่มจาก instrumentation.ts) — ไม่ต้องมี unit ใหม่บนเซิร์ฟเวอร์และไม่ต้องมี token ยิง POST (POST ต้อง Google login)
// uat-runs / uat-scripts import ตอนใช้ ไม่ใช่ตอนเริ่มเซิร์ฟเวอร์ (uat-runs อ่าน runs/*/run.json ทั้งหมดตอนโหลด)
declare global {
  // eslint-disable-next-line no-var
  var __nightly_timer: ReturnType<typeof setInterval> | undefined;
}

async function realEnv(): Promise<Env> {
  const { activeRunCount, startRuns } = await import("./uat-runs");
  const { isAiScript, loadScripts } = await import("./uat-scripts");
  return {
    now: Date.now,
    config: () => ({ enabled: getSettings().nightlyEnabled, time: getSettings().nightlyTime }),
    load: loadState,
    save: saveState,
    active: activeRunCount,
    scriptIds: () => loadScripts().scripts.map((s) => s.id).filter((id) => !isAiScript(id)),
    start: (ids, night) => startRuns(ids, undefined, undefined, night),
    note: (text) => pushActivity({ kind: "batch", text }),
  };
}

export function startNightly() {
  if (global.__nightly_timer) return; // dev reload / import ซ้ำ ไม่ตั้งตัวที่สอง
  global.__nightly_timer = setInterval(() => {
    realEnv().then(tick).catch((e) => writeLog("server", { event: "nightly", ok: false, error: e instanceof Error ? e.message : String(e) }));
  }, 30_000);
  global.__nightly_timer.unref();
}

export interface NightReport {
  enabled: boolean;
  time: string;
  nights: string[]; // คืนที่เคยสั่งรัน ใหม่สุดก่อน
  summary?: NightSummary;
}

// สรุปของคืนที่ขอ (ไม่ระบุ = คืนล่าสุด) เทียบกับคืนก่อนหน้าที่มีผลรันจริง
export async function nightReport(night?: string): Promise<NightReport> {
  const { nightlyEnabled: enabled, nightlyTime: time } = getSettings();
  const st = loadState();
  const nights = Object.keys(st.history).sort().reverse();
  const n = night ?? nights[0];
  if (!n) return { enabled, time, nights };
  const all = (await import("./uat-runs")).listRuns(Infinity);
  const retried = new Set(all.map((r) => r.retryOf));
  const of = (d: string) => all.filter((r) => r.nightly === d && !retried.has(r.id)); // ตัวรันขัดข้องแล้วลองใหม่เอง → นับเฉพาะรอบที่ลองใหม่
  if (!of(n).length && !st.history[n]) return { enabled, time, nights }; // คืนที่ไม่เคยสั่งรัน
  const prev = nights.find((d) => d < n && of(d).length);
  return { enabled, time, nights, summary: summarize(n, st, of(n), prev ? { night: prev, runs: of(prev) } : undefined) };
}
