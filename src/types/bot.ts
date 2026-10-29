// หมวดโมดูลของ ERP ที่บอทแต่ละตัวรับผิดชอบ — ตรงกับฟิลด์ "module" ในไฟล์ uat-scripts/*.json
export type BotRole =
  | "master"
  | "sales"
  | "purchase"
  | "inventory"
  | "gl"
  | "tax"
  | "reports"
  | "security"
  | "admin"
  | "recon"
  | "cash";

// มุมตรวจของบอทในแต่ละโมดูล: หน้าจอจริง / ฐานข้อมูล PostgreSQL / API
export type Lens = "screen" | "data" | "api";

export type BotStatus = "idle" | "running" | "completed" | "error" | "paused";

// S1 เงิน/ภาษี/สต็อก/GL ผิด · S2 ฟีเจอร์หลักพัง · S3 ผิดบางกรณี · S4 เล็กน้อย
export type Severity = "S1" | "S2" | "S3" | "S4";

export interface BotEvent {
  id: string;
  timestamp: string; // ISO
  type: "info" | "pass" | "fail" | "skip" | "error";
  content: string;
}

export interface BotTask {
  id: string;
  title: string;
  kind: "script" | "agent";
  status: BotStatus;
  startedAt: string; // ISO
  finishedAt?: string; // ISO
  result?: string;
  runId?: string;
  scriptId?: string;
  prompt?: string;
}

export interface BotStats {
  runs: number;
  passed: number;
  failed: number;
  stepsChecked: number;
  lastActive: string | null; // ISO
}

export interface BotConfig {
  id: string;
  number: number;
  name: string;
  role: BotRole;
  lens: Lens;
  roleTitle: string;
  roleDescription: string;
  avatarIcon: string;
  accent: string; // สีประจำบอท (hex) ใช้ในหน้าจอ
  status: BotStatus;
  systemPrompt: string;
  focus: string; // จุดที่บอท AI ต้องสำรวจเพิ่มจากสคริปต์
  currentTask?: BotTask;
  taskHistory: BotTask[];
  events: BotEvent[];
  stats: BotStats;
}

export interface SwarmSettings {
  erpTargetUrl: string;
  brainModel: string; // รุ่นบน Ollama Cloud แยกตามงาน — งานเร็ว: เลือกบอท + Stagehand (ui.act) ในตัวรัน
  scriptModel: string; // เขียนสคริปต์ตรวจจากคำสั่ง
  analystModel: string; // วิเคราะห์รอบที่ไม่ผ่านก่อนเปิด issue
  eyesModel: string; // ดูภาพหน้าจอ (ui.see · ui.play)
  autoIssueMate: boolean; // ส่งรอบที่ไม่ผ่านเข้า IssueMate อัตโนมัติ
  autoScripts: boolean; // จบชุดทดสอบแล้วให้ AI เสนอ+เขียนสคริปต์ใหม่เอง (on the fly)
  autoRetest: boolean; // ticket ที่ Tester เปิดเป็น deployed ใน IssueMate → รันสคริปต์เดิมตรวจซ้ำเอง (auto-retest.ts)
  maxParallelBots: number;
  headed: boolean;
  nightlyEnabled: boolean; // รอบ regression เต็มตอนกลางคืน (ค่าเริ่มต้นปิด) — จดลง runs/nightly.json เพราะ settings อื่นหายตอนรีสตาร์ท
  nightlyTime: string; // HH:MM เวลาไทย (Asia/Bangkok)
}

export interface BroadcastRequest {
  targetBotIds: string[];
  prompt: string;
  taskTitle: string;
}

// ---------- สคริปต์ UAT และผลการรัน ----------
export interface UatScript {
  id: string;
  title: string;
  module: BotRole;
  lens: Lens;
  severityOnFail: Severity;
  description: string;
  stepCount: number;
  cleanupCount: number;
  usesDb: boolean;
  ai: boolean; // AI เขียน: ask-*/auto-* หรือบันทึกผ่าน MCP save_script (ไฟล์มี "ai": true)
}

export type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped";

// ข้อค้นพบที่ไม่ทำให้ขั้นล้ม (ไม่เปิด issue อัตโนมัติ): baseline = ชิ้นในแถวเดียวกันกึ่งกลางเหลื่อมเกิน 1px, visual = ภาพต่างจากรอบล่าสุดที่ผ่านเกินเกณฑ์
export interface Finding {
  severity: Severity;
  kind: "baseline" | "visual";
  text: string;
  evidence?: string; // ภาพมีกรอบชี้จุด / ภาพ diff ใน runs/<id>/
}

export interface StepResult {
  i: number;
  title: string;
  kind: string;
  cleanup: boolean;
  status: StepStatus;
  durationMs?: number;
  detail?: string;
  expected?: string;
  actual?: string;
  evidence?: string; // ชื่อไฟล์ใน runs/<id>/
  query?: string; // SQL หรือคำขอ API จริงของขั้นนี้ — การ์ดบอทโชว์แทนภาพหน้าจอ
  flaky?: boolean; // ล้มครั้งแรกแต่ผ่านตอนลองซ้ำ (runner/run.mjs RETRY)
  findings?: Finding[];
}

export type RunStatus = "queued" | "running" | "passed" | "failed" | "error" | "stopped";

export interface ScriptRun {
  id: string;
  scriptId: string;
  scriptTitle: string;
  module: BotRole;
  lens: Lens;
  severityOnFail: Severity;
  botId: string;
  target: string;
  headed: boolean;
  status: RunStatus;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  steps: StepResult[];
  passed: number;
  failed: number;
  skipped: number;
  issues: number; // จำนวน HTTP>=400 / JS error / ข้อความ DB error ที่ตัวตรวจจับได้
  message?: string;
  pid?: number;
  issue?: IssueLink;
  noIssue?: string; // เหตุผลที่ไม่เปิด issue อัตโนมัติ (สคริปต์พังเอง / สคริปต์ auto-*) ให้คนเห็นบนการ์ดและหน้ารอบ
  retestOf?: string; // เลข issue ที่สั่งตรวจซ้ำ
  ai?: boolean; // สคริปต์ที่ AI เขียน (ดู UatScript.ai)
  healOf?: string; // รอบลองสคริปต์ที่ AI ซ่อม: รันจาก runs/<healOf>/heal.json แทนไฟล์ในคลัง (command.ts healScript)
  nightly?: string; // รอบกลางคืนของวันที่ไทย YYYY-MM-DD ที่สั่งรอบนี้ (ไว้สรุปเช้า)
  liveAt?: string; // เวลาภาพหน้าจอสดล่าสุด (runs/<id>/live.jpg)
}

export interface IssueLink {
  status: "sending" | "sent" | "duplicate" | "error";
  code?: string; // เช่น SMLAIACC-17
  message?: string;
  analysis?: string; // บทวิเคราะห์จากสมอง AI
  at: string;
}

export interface HealthCheck {
  ok: boolean;
  message: string;
  url?: string;
}

export interface HealthReport {
  erp: HealthCheck;
  db: HealthCheck;
  brain: HealthCheck;
  issuemate: HealthCheck;
  timestamp: string;
}
