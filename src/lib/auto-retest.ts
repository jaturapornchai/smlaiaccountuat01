import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// ticket ที่ Tester เปิดใน IssueMate เปลี่ยนเป็น deployed → สั่งรันสคริปต์เดิมแบบ retestOf เอง แล้ว closeLoop / sendToIssueMate แจ้งผลกลับ ticket เดิม
// IssueMate ไม่มี webhook (D:\issuemate ไม่มีโค้ดส่งเหตุการณ์ออก) → instrumentation.ts เรียก pollDeployed เป็นช่วง
// ไฟล์นี้ไม่ import โค้ดแอป (รับ list/start จากผู้เรียก) ให้ auto-retest.check.mjs ส่ง client ปลอมเข้ามาตรวจได้

export interface DeployedIssue {
  code: string;
  status?: string;
  reporter?: string;
  description?: string;
  closedAt?: string; // IssueMate ตั้งใหม่ทุกครั้งที่เป็น deployed → deploy รอบใหม่หลังเปิดกลับมาแก้ = ตรวจซ้ำอีกรอบ
}

export interface RetestDeps {
  list: () => Promise<DeployedIssue[]>;
  start: (scriptIds: string[], retestOf: string) => { runs: unknown[]; unknown: string[] };
  stateFile: string;
  note?: (text: string, code: string, scriptId: string) => void;
}

// reporter / บรรทัดสคริปต์ ตามที่ reportRun (issuemate.ts) เขียนตอนเปิด ticket — IssueMate ต่อท้าย reporter ด้วย " [อีเมลเจ้าของ token]"
const REPORTER = "UAT Tester Swarm";
const SCRIPT_LINE = /สคริปต์: uat-scripts\/([a-z0-9-]+)\.json/;

export const testerScript = (i: DeployedIssue) => (i.status === "deployed" && i.reporter?.startsWith(REPORTER) ? i.description?.match(SCRIPT_LINE)?.[1] : undefined);

// คืนเลข ticket ที่สั่งตรวจซ้ำรอบนี้ · ไฟล์สถานะยังไม่มี (เปิดสวิตช์ครั้งแรก) = จดของที่ deployed อยู่แล้วไว้เฉยๆ ไม่รันย้อนหลัง
export async function pollDeployed(d: RetestDeps): Promise<string[]> {
  const first = !existsSync(d.stateFile);
  const done: Record<string, string> = first ? {} : JSON.parse(readFileSync(d.stateFile, "utf8"));
  const todo: [string, string][] = [];
  for (const i of await d.list()) {
    const sid = testerScript(i);
    const mark = i.closedAt ?? "deployed";
    if (!sid || done[i.code] === mark) continue;
    done[i.code] = mark;
    todo.push([i.code, sid]);
  }
  // จดก่อนสั่งรัน: รีสตาร์ทกลางทาง / สคริปต์หาย ก็ไม่วนสั่งซ้ำทุกรอบ
  mkdirSync(dirname(d.stateFile), { recursive: true });
  writeFileSync(d.stateFile, JSON.stringify(done, null, 1));
  if (first) return [];

  const started: string[] = [];
  for (const [code, sid] of todo) {
    const ok = d.start([sid], code).runs.length > 0;
    if (ok) started.push(code);
    d.note?.(ok ? `${code} deploy แล้ว → ตรวจซ้ำอัตโนมัติด้วยสคริปต์ ${sid}` : `${code} deploy แล้ว แต่ไม่พบสคริปต์ ${sid} (ถูกลบไปแล้ว) — ไม่ได้ตรวจซ้ำ`, code, sid);
  }
  return started;
}
