import { guard, ok } from "@/lib/api";
import { loadTrend, MAX_DAYS, RULES } from "@/lib/run-history";
import { loadScripts } from "@/lib/uat-scripts";

// แนวโน้มจากประวัติรอบทดสอบถาวร · ?days=30 (1–90) · อ่านเฉพาะไฟล์รายเดือนที่คาบเกี่ยวช่วงที่ขอ ไม่โหลดทั้งประวัติ
export const GET = (req: Request) =>
  guard(() => {
    const trend = loadTrend(Number(new URL(req.url).searchParams.get("days")) || 30);
    const title = new Map(loadScripts().scripts.map((s) => [s.id, s.title]));
    const named = <T extends { scriptId: string }>(xs: T[]) => xs.map((x) => ({ ...x, title: title.get(x.scriptId) ?? x.scriptId }));
    return ok({ ...trend, slow: named(trend.slow), flaky: named(trend.flaky), rules: RULES, maxDays: MAX_DAYS });
  });
