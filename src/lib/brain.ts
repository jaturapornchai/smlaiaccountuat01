import { HealthCheck } from "@/types/bot";
import { timed } from "./log";

// สมองของบอท = Ollama Cloud — คีย์อยู่ใน .env.local เท่านั้น
const API = process.env.OLLAMA_API_URL || "https://ollama.com";
export const DEFAULT_BRAIN = process.env.OLLAMA_MODEL || "deepseek-v4.1-flash"; // เร็ว ~1 วิ อ่านภาพได้ ตอบไทยได้ (ทดสอบ 2026-10-29)

const auth = () => {
  const key = process.env.OLLAMA_API_KEY;
  if (!key) throw new Error("ยังไม่ได้ตั้ง OLLAMA_API_KEY ใน .env.local");
  return { Authorization: `Bearer ${key}` };
};

// images = base64 ของภาพ png/jpg (โมเดลต้องรองรับ vision) · format = JSON schema ให้ตอบเป็น JSON
export const askBrain = (model: string, system: string, prompt: string, images: string[] = [], format?: object) =>
  timed("brain", { model, images: images.length, json: !!format, prompt: prompt.slice(0, 1500) }, () => callBrain(model, system, prompt, images, format), (reply) => ({ reply: reply.slice(0, 1500), replyChars: reply.length }));

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
        { role: "system", content: system },
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
        return await timed("web", { query }, async () => {
          const res = await fetch(`${API}/api/web_search`, {
            method: "POST",
            headers: { ...auth(), "Content-Type": "application/json" },
            body: JSON.stringify({ query, max_results: perQuery }),
            signal: AbortSignal.timeout(20_000),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(`HTTP ${res.status} ${j?.error ?? ""}`);
          return (j.results ?? []) as { title?: string; url?: string; content?: string }[];
        }, (r) => ({ hits: r.length, urls: r.map((x) => x.url) }));
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

export async function checkBrain(model: string): Promise<HealthCheck> {
  try {
    const res = await fetch(`${API}/api/tags`, { headers: auth(), signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, message: `Ollama Cloud ตอบ HTTP ${res.status}`, url: API };
    const names: string[] = ((await res.json()).models ?? []).map((m: { name: string }) => m.name);
    return names.includes(model)
      ? { ok: true, message: `สมอง AI พร้อม (${model})`, url: API }
      : { ok: false, message: `ไม่พบโมเดล ${model} ใน Ollama Cloud`, url: API };
  } catch (e) {
    return { ok: false, message: `ต่อ Ollama Cloud ไม่ได้: ${(e as Error).message}`, url: API };
  }
}
