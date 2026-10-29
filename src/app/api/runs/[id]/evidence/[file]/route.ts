import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cookies } from "next/headers";
import { bad, guard } from "@/lib/api";
import { COOKIE, sessionEmail } from "@/lib/admin-session";
import { RUN_DIR } from "@/lib/uat-runs";

// ชื่อไฟล์ถูกจำกัดด้วย regex (ไม่มี / .. หรือ \) กัน path traversal
const ID = /^[A-Z0-9]+$/;
const FILE = /^[\w-]+\.(png|jpg|json|pdf|webm|zip)$/;
const TYPE: Record<string, string> = { png: "image/png", jpg: "image/jpeg", pdf: "application/pdf", webm: "video/webm", zip: "application/zip", json: "application/json; charset=utf-8" };

export const GET = (_req: Request, { params }: { params: Promise<{ id: string; file: string }> }) =>
  guard(async () => {
    const { id, file } = await params;
    if (!ID.test(id) || !FILE.test(file)) return bad("ชื่อไฟล์ไม่ถูกต้อง", 400);
    const ext = file.slice(file.lastIndexOf(".") + 1);
    // trace.zip เก็บ cookie session ของ Demo และ response ทุกตัวของรอบไว้ด้วย → ให้เฉพาะผู้ดูแล (ภาพ/วิดีโอเปิดทุกคนเหมือนเดิม)
    if (ext === "zip" && !(await sessionEmail((await cookies()).get(COOKIE)?.value))) return bad("ดาวน์โหลด trace ได้เฉพาะผู้ดูแล (เข้าสู่ระบบด้วย Google ที่ uat.smlwork.com ก่อน)", 403);
    let data: Buffer;
    try {
      data = readFileSync(join(RUN_DIR, id, file));
    } catch {
      return bad("ไม่พบไฟล์หลักฐาน", 404);
    }
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": TYPE[ext], "Cache-Control": "no-store", ...(ext === "zip" && { "Content-Disposition": `attachment; filename="trace-${id}.zip"` }) },
    });
  });
