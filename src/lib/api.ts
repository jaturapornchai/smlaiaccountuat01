import { NextResponse } from "next/server";
import { writeLog } from "./log";

export const ok = (data: object = {}) => NextResponse.json({ success: true, ...data });
export const bad = (message: string, status = 400) => NextResponse.json({ success: false, message }, { status });

// จับ exception ทุกจุดของ route แล้วตอบ 500 พร้อมข้อความ (ไม่ซ่อน error)
export async function guard(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    writeLog("api", { ok: false, error: e instanceof Error ? e.message : String(e) });
    return bad(e instanceof Error ? e.message : String(e), 500);
  }
}
