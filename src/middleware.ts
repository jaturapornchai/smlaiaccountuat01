import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sessionEmail } from "@/lib/admin-session";

// ทุกคนดูได้ (GET) · คำสั่งที่เปลี่ยนสถานะ (POST: รัน, ตั้งค่า, ถาม AI, ส่ง issue) ต้องเป็นผู้ดูแลที่เข้าสู่ระบบ Google
// /api/mcp ตรวจ Bearer ของตัวเอง · /api/auth คือจุดเข้าสู่ระบบ
export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || p === "/api/mcp" || p === "/api/auth") return NextResponse.next();
  if (await sessionEmail(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  return NextResponse.json({ success: false, message: "ดูได้อย่างเดียว — สั่งงานได้เฉพาะผู้ดูแลที่เข้าสู่ระบบ Google" }, { status: 401 });
}

export const config = { matcher: "/api/:path*", runtime: "nodejs" };
