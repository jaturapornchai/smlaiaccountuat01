import { guard, ok } from "@/lib/api";
import { logDays, readLogs } from "@/lib/log";

// GET /api/logs?date=YYYY-MM-DD&kind=brain&q=คำค้น&errors=1&limit=100 — บันทึกการทำงานถาวร (สรุป + รายการล่าสุด)
export const GET = (req: Request) =>
  guard(() => {
    const p = new URL(req.url).searchParams;
    const r = readLogs({ date: p.get("date") ?? undefined, kind: p.get("kind") ?? undefined, q: p.get("q") ?? undefined, errors: p.get("errors") === "1", limit: Number(p.get("limit")) || 100 });
    return ok({ days: logDays(), ...r });
  });
