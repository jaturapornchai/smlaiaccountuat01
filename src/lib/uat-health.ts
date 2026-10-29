import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HealthCheck as Check, HealthReport } from "@/types/bot";
import { checkBrain, MODEL_KEYS } from "./brain";
import { checkIssueMate } from "./issuemate";
import { getSettings } from "./swarm-store";

const run = promisify(execFile);

const cut = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 220);

async function ping(url: string, label: string): Promise<Check> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: "manual" });
    return { ok: res.status < 500, message: `${label}ตอบกลับ HTTP ${res.status}` };
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    return { ok: false, message: `เชื่อมต่อ${label}ไม่ได้ (${cause?.code ?? cause?.message ?? (e as Error).message})` };
  }
}

// ถามชื่อฐานข้อมูลที่ต่ออยู่จริงด้วย psql แบบอ่านอย่างเดียว แล้วเทียบกับรายการที่อนุญาต — รหัสผ่านส่งผ่าน env เท่านั้น
// psql แบบอ่านอย่างเดียว (ฐาน Demo ใน .env.local) — รหัสผ่านส่งผ่าน env เท่านั้น · คืน stdout แบบ -At
export const psqlRead = (sql: string, timeout = 8000) => psql(sql, { timeout });

// write:true เฉพาะ test-db.ts (สร้าง/ลบฐาน uat_*) — ที่อื่นอ่านอย่างเดียว
export async function psql(sql: string, { db = process.env.UAT_PG_DATABASE, write = false, timeout = 8000 } = {}): Promise<string> {
  const e = process.env;
  const { stdout } = await run(e.UAT_PSQL || "C:/Program Files/PostgreSQL/18/bin/psql.exe", ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql], {
    timeout,
    maxBuffer: 4 << 20,
    env: { ...e, PGHOST: e.UAT_PG_HOST, PGPORT: e.UAT_PG_PORT || "5432", PGUSER: e.UAT_PG_USER, PGPASSWORD: e.UAT_PG_PASSWORD || "", PGDATABASE: db, PGOPTIONS: write ? "" : "-c default_transaction_read_only=on" },
  });
  return stdout;
}

async function checkDb(): Promise<Check> {
  const e = process.env;
  if (!e.UAT_PG_HOST || !e.UAT_PG_USER || !e.UAT_PG_DATABASE) {
    return { ok: false, message: "ยังไม่ได้ตั้ง UAT_PG_HOST / UAT_PG_USER / UAT_PG_PASSWORD / UAT_PG_DATABASE ใน .env.local" };
  }
  try {
    const db = (await psqlRead("select current_database()")).trim();
    const allow = (e.UAT_PG_ALLOW_DB || "smldemo").split(",").map((x) => x.trim());
    return allow.includes(db)
      ? { ok: true, message: `ต่อฐานข้อมูล ${db} ได้ (ฐาน Demo ที่อนุญาต)` }
      : { ok: false, message: `ต่ออยู่กับฐาน "${db}" ซึ่งไม่อยู่ในรายการที่อนุญาต (${allow.join(", ")}) — ตัวรันจะปฏิเสธทุกขั้นตอน db.*` };
  } catch (err) {
    return { ok: false, message: `ต่อฐานข้อมูลไม่ได้: ${cut(String((err as { stderr?: string }).stderr || (err as Error).message))}`.replaceAll(e.UAT_PG_PASSWORD || "\u0000", "***") };
  }
}

export async function checkAll(): Promise<HealthReport> {
  const s = getSettings();
  const [erp, db, brain, issuemate] = await Promise.all([ping(s.erpTargetUrl, "เว็บ ERP"), checkDb(), checkBrain(MODEL_KEYS.map((k) => s[k])), checkIssueMate()]);
  return { erp: { ...erp, url: s.erpTargetUrl }, db, brain, issuemate, timestamp: new Date().toISOString() };
}
