import { BotConfig, BotEvent, BotStatus, SwarmSettings } from "@/types/bot";
import { DEFAULT_MODELS, MODEL_KEYS } from "./brain";
import { isTime, loadState, saveState } from "./nightly";
import { INITIAL_BOTS } from "./swarm-data";

// สถานะอยู่ในหน่วยความจำของ Node (รีสตาร์ทเซิร์ฟเวอร์แล้วเริ่มใหม่) — ผลการรันจริงเก็บถาวรที่ runs/<id>/run.json
declare global {
  // eslint-disable-next-line no-var
  var __openhands_swarm_bots: BotConfig[] | undefined;
  // eslint-disable-next-line no-var
  var __openhands_swarm_settings: SwarmSettings | undefined;
}

const freshBots = (): BotConfig[] => JSON.parse(JSON.stringify(INITIAL_BOTS));

global.__openhands_swarm_bots ??= freshBots();
global.__openhands_swarm_settings ??= {
  erpTargetUrl: process.env.ERP_TARGET_URL || "https://www.smlwork.com",
  ...DEFAULT_MODELS,
  autoIssueMate: process.env.ISSUEMATE_AUTO !== "0",
  autoScripts: process.env.UAT_AUTO_SCRIPTS !== "0",
  autoRetest: process.env.UAT_AUTO_RETEST !== "0",
  maxParallelBots: 5,
  headed: process.env.UAT_HEADED === "1",
  // รอบกลางคืนจดลงไฟล์ (settings อื่นหายตอนรีสตาร์ท แต่ deploy ต้องไม่ปิดรอบคืนเอง) · ค่าเริ่มต้นปิด
  nightlyEnabled: loadState().enabled,
  nightlyTime: loadState().time,
};

export const getBots = (): BotConfig[] => global.__openhands_swarm_bots!;
export const getBotById = (id: string) => getBots().find((b) => b.id === id);
export const getSettings = (): SwarmSettings => global.__openhands_swarm_settings!;

export function resetAllBots(): BotConfig[] {
  global.__openhands_swarm_bots = freshBots();
  return getBots();
}

export function setBotStatus(id: string, status: BotStatus): BotConfig | null {
  const bot = getBotById(id);
  if (bot) bot.status = status;
  return bot ?? null;
}

const rid = () => Math.random().toString(36).slice(2, 9);

export function addEvent(bot: BotConfig, type: BotEvent["type"], content: string) {
  bot.events.push({ id: rid(), timestamp: new Date().toISOString(), type, content });
  if (bot.events.length > 300) bot.events.splice(0, bot.events.length - 300);
}

// รับเฉพาะฟิลด์ที่รู้จัก และตรวจชนิด/ช่วงค่า (กันค่าแปลกจาก body)
export function updateSettings(input: Record<string, unknown>): SwarmSettings {
  const cur = getSettings();
  const next = { ...cur };
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);

  const erp = str(input.erpTargetUrl);
  if (erp) {
    const u = new URL(erp); // โยน error ถ้าไม่ใช่ URL
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("ที่อยู่ ERP ต้องขึ้นต้นด้วย http:// หรือ https://");
    next.erpTargetUrl = u.origin;
  }
  for (const k of MODEL_KEYS) {
    const model = str(input[k]);
    if (!model) continue;
    if (!/^[\w.:/-]{1,80}$/.test(model)) throw new Error("ชื่อโมเดลไม่ถูกต้อง");
    next[k] = model;
  }
  if (typeof input.autoIssueMate === "boolean") next.autoIssueMate = input.autoIssueMate;
  if (typeof input.autoScripts === "boolean") next.autoScripts = input.autoScripts;
  if (typeof input.autoRetest === "boolean") next.autoRetest = input.autoRetest;
  if (typeof input.headed === "boolean") next.headed = input.headed;
  const nightlyTime = str(input.nightlyTime);
  if (nightlyTime !== undefined) {
    if (!isTime(nightlyTime)) throw new Error("เวลารอบกลางคืนต้องเป็นรูปแบบ HH:MM เช่น 02:00");
    next.nightlyTime = nightlyTime;
  }
  if (typeof input.nightlyEnabled === "boolean") next.nightlyEnabled = input.nightlyEnabled;
  if (input.maxParallelBots !== undefined) {
    const n = Number(input.maxParallelBots);
    if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error("จำนวนบอทรันพร้อมกันต้องเป็นเลข 1–10");
    next.maxParallelBots = n;
  }
  global.__openhands_swarm_settings = next;
  if (next.nightlyEnabled !== cur.nightlyEnabled || next.nightlyTime !== cur.nightlyTime) saveState({ ...loadState(), enabled: next.nightlyEnabled, time: next.nightlyTime });
  return next;
}
