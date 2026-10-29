import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Lens, UatScript } from "@/types/bot";
import { LENSES, ROLES } from "./swarm-data";

export const SCRIPT_DIR = join(process.cwd(), "uat-scripts");
// ask-* = AI เขียนตามคำสั่งผู้ใช้ · auto-* = AI คิดเองหลังจบชุดทดสอบ — ทั้งคู่ต้องตรวจสคริปต์ก่อนเชื่อผล
export const isAiScript = (id: string) => /^(ask|auto)-/.test(id);

export interface LoadedScript extends UatScript {
  file: string;
}

// อ่านสคริปต์สดทุกครั้ง — แก้ไฟล์ .json แล้วกดรีเฟรชได้เลย ไม่ต้องรีสตาร์ท
export function loadScripts(): { scripts: LoadedScript[]; errors: { file: string; error: string }[] } {
  const scripts: LoadedScript[] = [];
  const errors: { file: string; error: string }[] = [];
  for (const f of readdirSync(SCRIPT_DIR).filter((n) => n.endsWith(".json")).sort()) {
    try {
      const j = JSON.parse(readFileSync(join(SCRIPT_DIR, f), "utf8"));
      if (!/^[a-z0-9-]+$/.test(j.id ?? "")) throw new Error("id ต้องเป็น a-z 0-9 และ - เท่านั้น");
      if (!j.title) throw new Error("ไม่มี title");
      if (!ROLES.includes(j.module)) throw new Error(`module "${j.module}" ไม่ตรงกับบอทตัวไหน`);
      if (!Array.isArray(j.steps) || !j.steps.length) throw new Error("steps ว่าง");
      if (scripts.some((s) => s.id === j.id)) throw new Error(`id ซ้ำกับสคริปต์อื่น: ${j.id}`);
      const steps: { do?: string }[] = [...j.steps, ...(j.cleanup ?? [])];
      const usesDb = steps.some((s) => s.do?.startsWith("db."));
      const lens: Lens = j.lens ?? (usesDb ? "data" : "screen"); // ไม่ระบุ: มี db.* = บอทฐานข้อมูล, ไม่มี = บอทหน้าจอ
      if (!LENSES.some((l) => l.key === lens)) throw new Error(`lens "${lens}" ต้องเป็น screen / data / api`);
      scripts.push({
        id: j.id,
        title: j.title,
        module: j.module,
        lens,
        severityOnFail: j.severityOnFail ?? "S2",
        description: j.description ?? "",
        stepCount: j.steps.length,
        cleanupCount: (j.cleanup ?? []).length,
        usesDb,
        ai: j.ai === true || isAiScript(j.id),
        file: join(SCRIPT_DIR, f),
      });
    } catch (e) {
      errors.push({ file: f, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { scripts, errors };
}
