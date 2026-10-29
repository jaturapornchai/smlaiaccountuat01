// ผู้ดูแลที่สั่งงานผ่านหน้าเว็บได้ (คนอื่นดูได้อย่างเดียว) · คุกกี้ = "email|หมดอายุ|HMAC" ลงชื่อด้วย UAT_SESSION_SECRET
// ใช้ Web Crypto ล้วน เพื่อให้ทั้ง middleware และ route เรียกได้
export const ADMIN_EMAIL = (process.env.UAT_ADMIN_EMAIL || "").trim().toLowerCase(); // ไม่ตั้ง = ไม่มีใครเป็นผู้ดูแล (ไม่ฝังอีเมลในโค้ด);
export const COOKIE = "uat_admin";
export const MAX_AGE = 7 * 24 * 3600;

const enc = new TextEncoder();
const key = () => {
  const s = process.env.UAT_SESSION_SECRET;
  return s && s.length >= 32 ? crypto.subtle.importKey("raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]) : null;
};
const b64url = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function signSession(email: string) {
  const k = await key();
  if (!k) throw new Error("ยังไม่ได้ตั้ง UAT_SESSION_SECRET (ยาวอย่างน้อย 32 ตัว) บนเซิร์ฟเวอร์");
  const body = `${email}|${Math.floor(Date.now() / 1000) + MAX_AGE}`;
  return `${body}|${b64url(await crypto.subtle.sign("HMAC", k, enc.encode(body)))}`;
}

// คืนอีเมลผู้ดูแลถ้าคุกกี้ถูกต้องและยังไม่หมดอายุ ไม่งั้น null
export async function sessionEmail(cookie?: string): Promise<string | null> {
  const k = await key();
  const i = cookie?.lastIndexOf("|") ?? -1;
  if (!k || !cookie || i < 0) return null;
  const body = cookie.slice(0, i);
  const [email, exp] = body.split("|");
  if (email !== ADMIN_EMAIL || !(Number(exp) * 1000 > Date.now())) return null;
  try {
    return (await crypto.subtle.verify("HMAC", k, unb64url(cookie.slice(i + 1)), enc.encode(body))) ? email : null;
  } catch {
    return null;
  }
}
