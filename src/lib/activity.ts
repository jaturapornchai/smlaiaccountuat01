import { RunStatus } from "@/types/bot";
import { writeLog } from "./log";

// ฟีดเหตุการณ์สองทาง: คำสั่งจาก AI (MCP) → หน้าเว็บเล่นแอนิเมชัน · ผลรัน/issue → AI อ่านผ่าน MCP tool "events"
export interface Activity {
  seq: number;
  at: string;
  kind: "mcp" | "run" | "batch" | "issue" | "fixed" | "note";
  text: string;
  client?: string; // AI ที่สั่ง (mcp/note)
  tool?: string;
  status?: RunStatus | "sending" | "sent" | "duplicate" | "error";
  runId?: string;
  scriptId?: string;
  code?: string; // เลข issue ใน IssueMate
  passed?: number;
  failed?: number;
}

export interface AiLink {
  client: string;
  tool: string;
  at: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __uat_activity: { seq: number; list: Activity[]; waiters: Set<() => void>; link?: AiLink } | undefined;
}
const A = (global.__uat_activity ??= { seq: 0, list: [], waiters: new Set() });

export function pushActivity(a: Omit<Activity, "seq" | "at">): Activity {
  const e = { ...a, seq: ++A.seq, at: new Date().toISOString() };
  A.list.push(e);
  if (A.list.length > 200) A.list.shift();
  const { kind, ...rest } = e;
  writeLog("activity", { type: kind, ...rest }); // ฟีดในหน่วยความจำเก็บแค่ 200 รายการ → ลงไฟล์ถาวรด้วย
  for (const w of A.waiters) w();
  return e;
}

// long-poll: มีเหตุการณ์ใหม่กว่า after → คืนทันที, ไม่มี → รอได้ถึง ms
export async function waitActivity(after: number, ms: number, signal?: AbortSignal) {
  if (after > A.seq) after = 0; // เซิร์ฟเวอร์รีสตาร์ท ตัวนับเริ่มใหม่
  if (A.seq <= after && ms > 0) await waitAny(ms, signal);
  return { seq: A.seq, events: A.list.filter((e) => e.seq > after) };
}

export function waitAny(ms: number, signal?: AbortSignal) {
  return new Promise<void>((res) => {
    const done = () => {
      clearTimeout(t);
      A.waiters.delete(done);
      res();
    };
    const t = setTimeout(done, ms);
    A.waiters.add(done);
    signal?.addEventListener("abort", done);
  });
}

export const touchLink = (client: string, tool: string) => (A.link = { client, tool, at: new Date().toISOString() });
export const getLink = () => A.link;
