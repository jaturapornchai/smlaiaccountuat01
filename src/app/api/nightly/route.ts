import { bad, guard, ok } from "@/lib/api";
import { nightReport } from "@/lib/nightly-run";

// สรุปรอบกลางคืน (ทุกคนดูได้) — ?date=YYYY-MM-DD ไม่ระบุ = คืนล่าสุด · ตั้งเวลา/เปิดปิดทำที่ POST /api/settings
export const GET = (req: Request) =>
  guard(async () => {
    const date = new URL(req.url).searchParams.get("date") ?? undefined;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("วันที่ต้องเป็นรูปแบบ YYYY-MM-DD");
    const r = await nightReport(date);
    if (date && !r.summary) return bad(`ไม่พบรอบกลางคืนของวันที่ ${date}`, 404);
    return ok(r);
  });
