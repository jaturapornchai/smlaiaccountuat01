import { HealthCheck } from "@/types/bot";
import { timed } from "./log";
import { EVIDENCE_RULE } from "../../runner/evidence-rule.mjs";

// สมองของบอท = Ollama Cloud — คีย์อยู่ใน .env.local เท่านั้น
const API = process.env.OLLAMA_API_URL || "https://ollama.com";
// รุ่นตามงาน — วัดกับงานจริง 2026-10-29: เขียนสคริปต์ mistral-large-4 ตรวจ 6 มิติ SQL ใช้ได้ 6/6 (deepseek-v4.1-flash ได้ 4 มิติ)
// วิเคราะห์ issue mistral-large-4 บอกชัดว่าส่วนไหนเดา (deepseek-v4-pro แต่งชื่อตาราง) · ดูจอ kimi-k3 ชี้ถูก 4/4 · งานเร็ว deepseek-v4.1-flash ~1 วิ
export const DEFAULT_MODELS = {
  brainModel: process.env.OLLAMA_MODEL || "deepseek-v4.1-flash",
  scriptModel: process.env.UAT_SCRIPT_MODEL || "mistral-large-4",
  analystModel: process.env.UAT_ANALYST_MODEL || "mistral-large-4",
  eyesModel: process.env.UAT_EYES_MODEL || "kimi-k3",
};
export const MODEL_KEYS = Object.keys(DEFAULT_MODELS) as (keyof typeof DEFAULT_MODELS)[];

const auth = () => {
  const key = process.env.OLLAMA_API_KEY;
  if (!key) throw new Error("ยังไม่ได้ตั้ง OLLAMA_API_KEY ใน .env.local");
  return { Authorization: `Bearer ${key}` };
};

// images = base64 ของภาพ png/jpg (โมเดลต้องรองรับ vision) · format = JSON schema ให้ตอบเป็น JSON
// Ollama Cloud จำกัดคำขอพร้อมกันต่อบัญชี (Pro/จ่ายตามใช้ 3, Max 10 — ollama.com/pricing 2026-10-29) เกินแล้วเข้าคิวฝั่งเขา
// ซึ่งกินเวลา timeout ของเรา (log 2026-10-29: พร้อมกัน 5 → mistral 99-120 วิ timeout) → ต่อคิวฝั่งเราแทน แล้วเริ่มนับเวลาตอนได้ช่อง
// ponytail: นับเฉพาะในโปรเซส Next — runner/run.mjs (ตาดูจอ) เรียกแยกเอง ยังแย่งช่องได้ · ทำคิวข้ามโปรเซสเมื่อเจอ 429 จริง
const MAX_CONCURRENT = Number(process.env.OLLAMA_MAX_CONCURRENT) || 3;
let busy = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: (waitMs: number) => Promise<T>): Promise<T> {
  const t = Date.now();
  if (busy < MAX_CONCURRENT) busy++;
  else await new Promise<void>((r) => waiting.push(r)); // ช่องถูกส่งต่อมาจากคนที่ใช้เสร็จ (busy ไม่ลด)
  try {
    return await fn(Date.now() - t);
  } finally {
    const next = waiting.shift();
    if (next) next();
    else busy--;
  }
}

// job = งานที่เรียก (pick/script/analyst) ลง log ไว้แยกดูว่างานไหนช้า/ล้ม · waitMs = เวลารอคิว (ms = เวลาที่โมเดลใช้จริง)
export const askBrain = (job: string, model: string, system: string, prompt: string, images: string[] = [], format?: object) =>
  slot((waitMs) => timed("brain", { job, model, waitMs, images: images.length, json: !!format, prompt: prompt.slice(0, 1500) }, () => callBrain(model, system, prompt, images, format), (reply) => ({ reply: reply.slice(0, 1500), replyChars: reply.length })));

async function callBrain(model: string, system: string, prompt: string, images: string[], format?: object): Promise<string> {
  const res = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: { ...auth(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      ...(format ? { format, options: { temperature: 0 } } : {}),
      messages: [
        { role: "system", content: `${system}\n\n${EVIDENCE_RULE}` }, // กฎกลางห้ามเดา/ตรวจตามระบบ SML ต่อท้ายทุกงาน
        { role: "user", content: prompt, ...(images.length ? { images } : {}) },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Ollama Cloud ตอบ HTTP ${res.status}${data.error ? `: ${data.error}` : ""}`);
  const text = String(data.message?.content ?? "").trim();
  if (!text) throw new Error("Ollama Cloud ตอบกลับว่างเปล่า");
  return text;
}

// ค้นเว็บผ่าน Ollama Cloud (คีย์เดียวกับสมอง, POST /api/web_search) ให้บอทอ้างกฎหมายภาษี/มาตรฐานบัญชี และดูว่าโปรแกรมอื่นทำอย่างไร
// ค้นไม่ได้ = คืนค่าว่าง ไม่ให้งานหลักล้ม · ตัดเนื้อหาสั้นกัน prompt บวม
export async function webResearch(queries: string[], perQuery = 3): Promise<string> {
  const found = await Promise.all(
    queries.map(async (query) => {
      try {
        return await slot((waitMs) => timed("web", { query, waitMs }, async () => {
          const res = await fetch(`${API}/api/web_search`, {
            method: "POST",
            headers: { ...auth(), "Content-Type": "application/json" },
            body: JSON.stringify({ query, max_results: perQuery }),
            signal: AbortSignal.timeout(20_000),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(`HTTP ${res.status} ${j?.error ?? ""}`);
          return (j.results ?? []) as { title?: string; url?: string; content?: string }[];
        }, (r) => ({ hits: r.length, urls: r.map((x) => x.url) })));
      } catch {
        return [];
      }
    }),
  );
  const seen = new Set<string>();
  return found
    .flat()
    .filter((r) => r.url && !seen.has(r.url) && seen.add(r.url))
    .map((r) => `- ${r.title ?? ""} — ${r.url}\n  ${String(r.content ?? "").replace(/\s+/g, " ").slice(0, 600)}`)
    .join("\n");
}

// กฎกลางข้อ 3 (runner/evidence-rule.mjs): URL ที่ AI อ้างต้องมีอยู่ในแหล่งที่ให้ไป (ผลค้นเว็บ/หลักฐาน/MCP ของ SML) — ที่แต่งขึ้นถูกตัดทิ้ง
export function checkSources(text: string, sources: string): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const out = text.replace(/https?:\/\/[^\s<>"'`)\]]+/g, (u) => {
    const bare = u.replace(/[.,;:!?]+$/, "");
    if (sources.includes(bare) || sources.includes(bare.replace(/\/$/, ""))) return u;
    dropped.push(bare);
    return `(ตัด URL ที่ไม่มีในแหล่งอ้างอิง)${u.slice(bare.length)}`;
  });
  return { text: out, dropped };
}

export async function checkBrain(models: string[]): Promise<HealthCheck> {
  try {
    const res = await fetch(`${API}/api/tags`, { headers: auth(), signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, message: `Ollama Cloud ตอบ HTTP ${res.status}`, url: API };
    const names: string[] = ((await res.json()).models ?? []).map((m: { name: string }) => m.name);
    const want = [...new Set(models)];
    const missing = want.filter((m) => !names.includes(m));
    return missing.length
      ? { ok: false, message: `ไม่พบโมเดล ${missing.join(", ")} ใน Ollama Cloud`, url: API }
      : { ok: true, message: `สมอง AI พร้อม (${want.join(" · ")})`, url: API };
  } catch (e) {
    return { ok: false, message: `ต่อ Ollama Cloud ไม่ได้: ${(e as Error).message}`, url: API };
  }
}
