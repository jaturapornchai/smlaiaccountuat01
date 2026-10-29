import { bad, guard, ok } from "@/lib/api";
import { getRun, sendToIssueMate, stopRun } from "@/lib/uat-runs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: Request, { params }: Ctx) =>
  guard(async () => {
    const run = getRun((await params).id);
    return run ? ok({ run }) : bad("ไม่พบรอบการรันนี้", 404);
  });

export const POST = (req: Request, { params }: Ctx) =>
  guard(async () => {
    const { action } = await req.json().catch(() => ({}));
    const id = (await params).id;
    if (action === "issuemate") {
      const r = getRun(id);
      if (!r) return bad("ไม่พบรอบการรันนี้", 404);
      if (r.status !== "failed" && r.status !== "error") return bad("ส่งได้เฉพาะรอบที่ไม่ผ่านหรือผิดพลาด");
      return ok({ run: await sendToIssueMate(r) });
    }
    if (action !== "stop") return bad("คำสั่งไม่ถูกต้อง");
    const run = stopRun(id);
    return run ? ok({ run }) : bad("ไม่พบรอบการรันนี้", 404);
  });
