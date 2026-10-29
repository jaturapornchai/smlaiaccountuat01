import { cookies } from "next/headers";
import { bad, guard, ok } from "@/lib/api";
import { ADMIN_EMAILS, COOKIE, MAX_AGE, sessionEmail, signSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

// Client ID ของ UAT Tester เอง (ค่าสาธารณะ, โปรเจกต์ bcai-474907) — origin ที่อนุญาต: https://uat.smlwork.com
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "501250317679-5kud8iffqn7vejsd4kds7p3156mr58bc.apps.googleusercontent.com";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export const GET = () =>
  guard(async () => ok({ email: await sessionEmail((await cookies()).get(COOKIE)?.value), clientId: CLIENT_ID }));

// รับ ID token จากปุ่ม Google แล้วให้ Google ตรวจ (tokeninfo แบบเดียวกับ smlaiaccount/frontend/src/app/api/auth/google/route.ts)
export const POST = (req: Request) =>
  guard(async () => {
    const { credential } = (await req.json().catch(() => ({}))) as { credential?: unknown };
    if (typeof credential !== "string" || !credential || credential.length > 4096) return bad("ไม่มีข้อมูลเข้าสู่ระบบจาก Google");
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { cache: "no-store" });
    const t = (await r.json().catch(() => ({}))) as { aud?: string; iss?: string; email?: string; email_verified?: string | boolean };
    if (!r.ok || t.aud !== CLIENT_ID || !ISSUERS.includes(t.iss ?? "") || String(t.email_verified) !== "true") return bad("Google ยืนยันตัวตนไม่ผ่าน", 401);
    const email = (t.email ?? "").toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) return bad(`บัญชี ${email} ดูได้อย่างเดียว — สั่งงานได้เฉพาะผู้ดูแล`, 403);
    const res = ok({ email });
    res.cookies.set(COOKIE, await signSession(email), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: MAX_AGE });
    return res;
  });

export const DELETE = () => {
  const res = ok();
  res.cookies.delete(COOKIE);
  return res;
};
