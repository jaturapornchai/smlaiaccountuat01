import { bad, guard, ok } from "@/lib/api";
import { getSettings, updateSettings } from "@/lib/swarm-store";

// ไม่มีค่าลับในนี้ — คีย์ Ollama / IssueMate / รหัสฐานข้อมูลอยู่ใน .env.local เท่านั้น
export const GET = () => guard(() => ok({ settings: getSettings() }));

export const POST = (req: Request) =>
  guard(async () => {
    try {
      return ok({ message: "บันทึกการตั้งค่าเรียบร้อย", settings: updateSettings(await req.json()) });
    } catch (e) {
      return bad(e instanceof Error ? e.message : String(e));
    }
  });
