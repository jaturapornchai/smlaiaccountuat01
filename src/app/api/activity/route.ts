import { guard, ok } from "@/lib/api";
import { getLink, waitActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

// หน้าเว็บ long-poll เหตุการณ์ (คำสั่ง MCP, ผลรัน, issue) เพื่อเล่นแอนิเมชันทันทีที่เกิด
export const GET = (req: Request) =>
  guard(async () => {
    const q = new URL(req.url).searchParams;
    const wait = Math.min(Math.max(Number(q.get("wait")) || 0, 0), 25);
    const d = await waitActivity(Math.max(Number(q.get("after")) || 0, 0), wait * 1000, req.signal);
    return ok({ seq: d.seq, events: d.events.slice(-20), link: getLink() ?? null });
  });
