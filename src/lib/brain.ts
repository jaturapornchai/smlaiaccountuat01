import { HealthCheck } from "@/types/bot";

// สมองของบอท = Ollama Cloud — คีย์อยู่ใน .env.local เท่านั้น
const API = process.env.OLLAMA_API_URL || "https://ollama.com";
export const DEFAULT_BRAIN = process.env.OLLAMA_MODEL || "deepseek-v4.1-flash"; // เร็ว ~1 วิ อ่านภาพได้ ตอบไทยได้ (ทดสอบ 2026-10-29)

const auth = () => {
  const key = process.env.OLLAMA_API_KEY;
  if (!key) throw new Error("ยังไม่ได้ตั้ง OLLAMA_API_KEY ใน .env.local");
  return { Authorization: `Bearer ${key}` };
};

// images = base64 ของภาพ png/jpg (โมเดลต้องรองรับ vision) · format = JSON schema ให้ตอบเป็น JSON
export async function askBrain(model: string, system: string, prompt: string, images: string[] = [], format?: object): Promise<string> {
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
