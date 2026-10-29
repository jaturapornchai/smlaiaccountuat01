import { cookies } from "next/headers";
import { bad, guard, ok } from "@/lib/api";
import { COOKIE, sessionEmail } from "@/lib/admin-session";
import { createToken, listTokens, revokeToken } from "@/lib/mcp-tokens";

export const dynamic = "force-dynamic";

// จัดการ MCP token (ผู้ดูแลเท่านั้น) · POST ถูกกั้นที่ middleware แล้ว ส่วน GET ตรวจเองเพราะ middleware ปล่อย GET ทุกคน
export const GET = () =>
  guard(async () => {
    if (!(await sessionEmail((await cookies()).get(COOKIE)?.value))) return bad("เฉพาะผู้ดูแล", 403);
    return ok({ tokens: listTokens(), envToken: !!process.env.UAT_MCP_TOKEN });
  });

// { action: "create", name } → คืนค่า token ครั้งเดียว · { action: "revoke", id }
export const POST = (req: Request) =>
  guard(async () => {
    const b = (await req.json().catch(() => ({}))) as { action?: string; name?: unknown; id?: unknown };
    if (b.action === "create") {
      try {
        const { token, item } = createToken(String(b.name ?? ""));
        return ok({ message: `สร้าง token "${item.name}" แล้ว · คัดลอกเก็บไว้ จะไม่แสดงอีก`, token, item });
      } catch (e) {
        return bad(e instanceof Error ? e.message : String(e));
      }
    }
    if (b.action === "revoke") return revokeToken(String(b.id ?? "")) ? ok({ message: "ยกเลิก token แล้ว" }) : bad("ไม่พบ token นี้", 404);
    return bad("action ต้องเป็น create หรือ revoke");
  });
