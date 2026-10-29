import { bad, guard, ok } from "@/lib/api";
import { listRuns, startRuns } from "@/lib/uat-runs";
import { loadScripts } from "@/lib/uat-scripts";
import { getBotById } from "@/lib/swarm-store";

export const GET = () => guard(() => ok({ runs: listRuns() }));

// body: { scriptIds?: string[], botIds?: string[], all?: boolean } — botIds = ทุกสคริปต์ที่ตรงกับโมดูล+มุมตรวจของบอทนั้น
export const POST = (req: Request) =>
  guard(async () => {
    const body = await req.json().catch(() => ({}));
    const { scripts } = loadScripts();
    let ids: string[] = Array.isArray(body.scriptIds) ? body.scriptIds : [];
    if (body.all) ids = scripts.map((s) => s.id);
    if (Array.isArray(body.botIds)) {
      const bots = body.botIds.map((b: string) => getBotById(b)).filter(Boolean);
      ids.push(...scripts.filter((s) => bots.some((b: { role: string; lens: string }) => b.role === s.module && b.lens === s.lens)).map((s) => s.id));
    }
    ids = [...new Set(ids)];
    if (!ids.length) return bad("ไม่ได้เลือกสคริปต์ที่จะรัน (หรือบอทที่เลือกยังไม่มีสคริปต์)");
    const { runs, unknown } = startRuns(ids);
    if (!runs.length) return bad(`ไม่พบสคริปต์: ${unknown.join(", ")}`, 404);
    return ok({ runs, unknown });
  });
