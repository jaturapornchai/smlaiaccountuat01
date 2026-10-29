import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bad, guard } from "@/lib/api";
import { RUN_DIR } from "@/lib/uat-runs";

// ชื่อไฟล์ถูกจำกัดด้วย regex (ไม่มี / .. หรือ \) กัน path traversal
const ID = /^[A-Z0-9]+$/;
const FILE = /^[\w-]+\.(png|jpg|json|pdf)$/;

export const GET = (_req: Request, { params }: { params: Promise<{ id: string; file: string }> }) =>
  guard(async () => {
    const { id, file } = await params;
    if (!ID.test(id) || !FILE.test(file)) return bad("ชื่อไฟล์ไม่ถูกต้อง", 400);
    let data: Buffer;
    try {
      data = readFileSync(join(RUN_DIR, id, file));
    } catch {
      return bad("ไม่พบไฟล์หลักฐาน", 404);
    }
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": file.endsWith(".png") ? "image/png" : file.endsWith(".jpg") ? "image/jpeg" : file.endsWith(".pdf") ? "application/pdf" : "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  });
