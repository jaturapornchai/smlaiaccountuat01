import { bad, guard, ok } from "@/lib/api";
import { getBots, resetAllBots } from "@/lib/swarm-store";
import { activeRunCount } from "@/lib/uat-runs";

export const GET = () => guard(() => ok({ count: getBots().length, bots: getBots() }));

export const POST = (req: Request) =>
  guard(async () => {
    const { action } = await req.json().catch(() => ({}));
    if (action !== "reset") return bad("คำสั่งไม่ถูกต้อง");
    if (activeRunCount()) return bad("มีสคริปต์กำลังรันหรืออยู่ในคิว — หยุดให้หมดก่อนรีเซ็ต", 409);
    return ok({ message: "รีเซ็ตสถานะบอททั้งหมดเรียบร้อย", bots: resetAllBots() });
  });
