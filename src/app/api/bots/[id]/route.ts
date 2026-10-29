import { bad, guard, ok } from "@/lib/api";
import { commandBot } from "@/lib/command";
import { getBotById } from "@/lib/swarm-store";
import { startRuns } from "@/lib/uat-runs";
import { loadScripts } from "@/lib/uat-scripts";

type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: Request, { params }: Ctx) =>
  guard(async () => {
    const bot = getBotById((await params).id);
    return bot ? ok({ bot }) : bad("ไม่พบบอทนี้", 404);
  });

// action: "run_scripts" รันสคริปต์ทั้งหมดของโมดูลบอทนี้ · "execute" สั่งงาน: AI เขียนสคริปต์จากคำสั่งแล้วรันจริง
export const POST = (req: Request, { params }: Ctx) =>
  guard(async () => {
    const { id } = await params;
    const bot = getBotById(id);
    if (!bot) return bad("ไม่พบบอทนี้", 404);
    const { action, prompt, title } = await req.json().catch(() => ({}));

    if (action === "run_scripts") {
      const ids = loadScripts().scripts.filter((s) => s.module === bot.role && s.lens === bot.lens).map((s) => s.id);
      if (!ids.length) return bad(`${bot.name} ยังไม่มีสคริปต์ของโมดูลและมุมตรวจนี้ (เพิ่มไฟล์ .json ใน uat-scripts/ หรือสั่งบอท AI สำรวจแทน)`, 404);
      return ok({ runs: startRuns(ids).runs });
    }
    if (action === "execute") {
      if (typeof prompt !== "string" || !prompt.trim()) return bad("กรุณาระบุคำสั่งให้บอท");
      return ok({ bot: await commandBot(id, prompt.trim(), title) });
    }
    return bad("คำสั่งไม่ถูกต้อง");
  });
