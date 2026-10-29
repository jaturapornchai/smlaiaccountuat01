import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HealthCheck, IssueLink, ScriptRun } from "@/types/bot";
import { askBrain, webResearch } from "./brain";
import { PERSONA } from "./swarm-data";
import { getSettings } from "./swarm-store";
import { isAiScript } from "./uat-scripts";

// ส่งผลทดสอบที่ไม่ผ่านเข้า IssueMate (MCP แบบ stateless: เรียก tools/call ได้เลยไม่ต้อง initialize)
const PRIORITY = { S1: "critical", S2: "high", S3: "medium", S4: "low" } as const;
const SENT_FILE = join(process.cwd(), "runs", "issuemate-sent.json");

async function rpc(method: string, params: object) {
  const { ISSUEMATE_MCP_URL: url, ISSUEMATE_TOKEN: token, ISSUEMATE_PROJECT: project = "SMLAIACC" } = process.env;
  if (!url || !token) throw new Error("ยังไม่ได้ตั้ง ISSUEMATE_MCP_URL / ISSUEMATE_TOKEN ใน .env.local");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "X-MCP-Project": project, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j) throw new Error(`IssueMate ตอบ HTTP ${res.status}`);
  if (j.error) throw new Error(`IssueMate: ${j.error.message}`);
  return j.result;
}

async function tool(name: string, args: object) {
  const result = await rpc("tools/call", { name, arguments: args });
  const text: string = result?.content?.[0]?.text ?? "";
  if (result?.isError) throw new Error(`IssueMate: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

const PROJECT = () => process.env.ISSUEMATE_PROJECT || "SMLAIACC";

// ตอบกลับใน issue เดิม (ผลตรวจซ้ำ) — ไม่เปลี่ยนสถานะ issue ให้ฝั่งคนแก้เป็นคนเลื่อนสถานะเอง
export const commentIssue = (code: string, message: string) =>
  tool("converse_on_issue", { projectKey: PROJECT(), code, agentName: "UAT Tester", role: "UAT Tester", message });

export async function checkIssueMate(): Promise<HealthCheck> {
  const url = process.env.ISSUEMATE_MCP_URL ? new URL(process.env.ISSUEMATE_MCP_URL).origin : undefined;
  try {
    const n = ((await rpc("tools/list", {}))?.tools ?? []).length;
    return { ok: n > 0, message: `IssueMate พร้อม (${process.env.ISSUEMATE_PROJECT || "SMLAIACC"} · ${n} เครื่องมือ)`, url };
  } catch (e) {
    return { ok: false, message: (e as Error).message, url };
  }
}

// ponytail: กันส่งซ้ำด้วยไฟล์ในเครื่อง (สคริปต์+ขั้นที่พัง) — สคริปต์ผ่านเมื่อไรรายการของมันถูกลบเอง (clearSent)
const readSent = (): Record<string, string> => (existsSync(SENT_FILE) ? JSON.parse(readFileSync(SENT_FILE, "utf8")) : {});

// สคริปต์ที่เคยเปิด issue นี้ (ใช้สั่งตรวจซ้ำด้วยเลข issue)
export const scriptsForIssue = (code: string) => [...new Set(Object.entries(readSent()).filter(([, c]) => c === code).map(([k]) => k.split("#")[0]))];

// สคริปต์ผ่านแล้ว → ปลดตัวกันส่งซ้ำของสคริปต์นั้น คืนเลข issue ที่เคยเปิดไว้
export function clearSent(scriptId: string): string[] {
  const sent = readSent();
  const keys = Object.keys(sent).filter((k) => k.startsWith(`${scriptId}#`));
  if (!keys.length) return [];
  const codes = [...new Set(keys.map((k) => sent[k]))];
  for (const k of keys) delete sent[k];
  writeFileSync(SENT_FILE, JSON.stringify(sent, null, 1));
  return codes;
}

const ANALYST = `${PERSONA}
งานตอนนี้: วิเคราะห์ผลทดสอบ UAT ของระบบบัญชี SML AI Account (Next.js + Go + PostgreSQL)
ผู้อ่านคือ AI นักพัฒนาที่จะรับ issue นี้ไปแก้ต่อ ตอบภาษาไทย สั้น ตรงประเด็น ไม่แต่งข้อมูลที่ไม่มีในหลักฐาน หัวข้อ:
1. ไม่ผ่านเพราะอะไร (1-2 บรรทัด: ขั้นไหน คาดหวังอะไร ได้อะไร)
2. สาเหตุที่น่าจะเป็น (เรียงจากน่าจะสุด ระบุว่าเป็นการคาดเดา)
3. จุดที่ควรตรวจในโค้ด/ตาราง (ชื่อตาราง คอลัมน์ API หรือหน้าจอที่เกี่ยว)
4. แนวทางแก้ไขที่แนะนำ (ทำอะไรที่ไหน เป็นข้อๆ ให้ AI ทำต่อได้ทันที · เรื่องภาษี/บัญชีให้อ้างหลักที่ถูกพร้อม URL)
5. วิธีตรวจว่าแก้แล้ว (รันสคริปต์ไหน ขั้นไหน คาดหวังค่าอะไร)`;

const TAXY = /ภาษี|VAT|ใบกำกับ|หัก ณ ที่จ่าย|ภ\.?ง\.?ด|ภ\.?พ|e-?Tax|บัญชี|GL|งบ|เดบิต|เครดิต|ค่าเสื่อม|ต้นทุน/i;

export async function reportRun(run: ScriptRun, outDir: string): Promise<IssueLink> {
  const at = () => new Date().toISOString();
  const failed = run.steps.filter((s) => s.status === "failed");
  const first = failed[0];
  const key = `${run.scriptId}#${first ? `${first.i}:${first.title}` : run.status}`;
  const sent = readSent();
  if (sent[key]) return { status: "duplicate", code: sent[key], message: `ปัญหาเดียวกับ ${sent[key]} ที่ส่งไปแล้ว`, at: at() };

  const line = (s: ScriptRun["steps"][number]) =>
    `- ขั้น ${s.i + 1} ${s.title} [${s.kind}]${s.detail ? ` — ${s.detail}` : ""}${s.expected !== undefined ? `\n  - คาดหวัง: \`${s.expected}\`` : ""}${s.actual !== undefined ? `\n  - ค่าจริง: \`${s.actual}\`` : ""}${s.query ? `\n  - คำสั่งที่รัน: \`${s.query}\`` : ""}`;
  // สคริปต์เดียว = issue เดียว: ขั้นแรกที่พังเปลี่ยนไปในรอบใหม่ (เช่น smoke ที่ตรวจหลายเมนู) → ต่อท้ายผลใน issue เดิมแทนการเปิดใหม่ จนกว่าสคริปต์จะผ่าน (clearSent)
  const open = Object.entries(sent).find(([k]) => k.startsWith(`${run.scriptId}#`))?.[1];
  if (open) {
    // รอบตรวจซ้ำของ issue นี้ → sendToIssueMate แจ้งผลใน issue เองแล้ว ไม่ต้องซ้ำ
    if (run.retestOf !== open) await commentIssue(open, [`รอบ \`${run.id}\` ยังไม่ผ่าน (ผ่าน ${run.passed} ไม่ผ่าน ${run.failed} ข้าม ${run.skipped})`, ...failed.map(line)].join("\n").slice(0, 20_000));
    writeFileSync(SENT_FILE, JSON.stringify({ ...sent, [key]: open }, null, 1));
    return { status: "duplicate", code: open, message: `สคริปต์เดิมยังไม่ผ่าน — ต่อท้ายผลรอบนี้ใน ${open}`, at: at() };
  }

  const shot = failed.find((s) => s.evidence?.endsWith(".png"))?.evidence;
  const png = shot && existsSync(join(outDir, shot)) ? readFileSync(join(outDir, shot)).toString("base64") : undefined;
  const facts = [
    `สคริปต์: uat-scripts/${run.scriptId}.json — ${run.scriptTitle}`,
    ...(isAiScript(run.scriptId) ? ["(สคริปต์นี้ AI เขียนเอง — ตรวจก่อนว่า SQL/ค่าคาดหวังในสคริปต์ถูกต้อง แล้วค่อยแก้ระบบ)"] : []),
    `เว็บที่ทดสอบ: ${run.target} · โมดูล ${run.module} · มุมตรวจ ${run.lens}`,
    `ผล: ${run.status} ผ่าน ${run.passed} ไม่ผ่าน ${run.failed} ข้าม ${run.skipped}${run.message ? ` · ${run.message}` : ""}`,
    `ตัวตรวจจับเจอ HTTP>=400 / JS error / DB error ${run.issues} ครั้ง`,
    "",
    "ขั้นที่ไม่ผ่าน:",
    ...(failed.length ? failed.map(line) : ["- (ไม่มีขั้นที่ไม่ผ่าน — รันผิดพลาดก่อนจบ)"]),
  ].join("\n");

  const model = getSettings().analystModel;
  let analysis: string;
  try {
    // เรื่องเงิน/ภาษี/บัญชี → ค้นกฎทางการมาประกอบ (เรื่องโค้ดล้วนไม่ต้องค้น กัน prompt ฟุ้ง)
    const refs = TAXY.test(facts) ? await webResearch([`${run.scriptTitle} ${first?.title ?? ""}`.slice(0, 120) + " กรมสรรพากร"]) : "";
    const web = refs ? `\n\nข้อมูลอ้างอิงจากเว็บ (อ้าง URL เมื่อใช้):\n${refs}` : "";
    analysis = await askBrain("analyst", model, ANALYST, `${facts}${web}${png ? "\n\n(แนบภาพหน้าจอตอนขั้นที่พัง)" : ""}`, png ? [png] : []);
  } catch (e) {
    analysis = `(สมอง AI วิเคราะห์ไม่สำเร็จ: ${(e as Error).message})`;
  }

  const repro = run.steps
    .filter((s) => !s.cleanup && (!first || s.i <= first.i))
    .map((s) => `${s.i + 1}. ${s.title}${s.status === "failed" ? " ← ไม่ผ่าน" : ""}`)
    .join("\n");
  const description = [
    `**ผลทดสอบ UAT อัตโนมัติไม่ผ่าน** · รอบ \`${run.id}\` · ${run.finishedAt ?? at()}`,
    "",
    `**ไม่ผ่านเพราะ:** ${first ? `ขั้น ${first.i + 1} ${first.title}${first.detail ? ` — ${first.detail}` : ""}${first.expected !== undefined ? ` (คาดหวัง \`${first.expected}\` ได้ \`${first.actual ?? ""}\`)` : ""}` : (run.message ?? run.status)}`,
    "",
    facts,
    "",
    "### ขั้นตอนทำซ้ำ",
    repro || "-",
    "",
    `### วิเคราะห์และแนวทางแก้โดยสมอง AI (${model}) — เป็นการคาดเดา ต้องตรวจโค้ดจริงก่อนแก้`,
    analysis,
    "",
    `ทำซ้ำด้วยตัวรัน: \`node runner/run.mjs --script uat-scripts/${run.scriptId}.json --out runs/<id> --base ${run.target}\``,
  ].join("\n");

  const res = await tool("create_issue", {
    projectKey: PROJECT(),
    title: `[UAT ${run.severityOnFail}] ${run.scriptTitle}${first ? ` — ขั้น ${first.i + 1} ${first.title}` : ""}`.slice(0, 200),
    description,
    type: "bug",
    priority: PRIORITY[run.severityOnFail],
    reporter: "UAT Tester Swarm",
    labels: ["uat", run.module, run.lens, run.severityOnFail],
    devopsMeta: { environment: "uat", targetServerOrDomain: new URL(run.target).host, incidentSeverity: run.severityOnFail },
    aiSummary: analysis.slice(0, 2000),
    files: [
      ...(png && shot ? [{ filename: shot, base64: png, mimeType: "image/png" }] : []),
      { filename: `uat-run-${run.id}.json`, contentText: JSON.stringify(run, null, 1).slice(0, 100_000), mimeType: "application/json" },
    ],
  });
  const code: string | undefined = res?.issue?.code;
  if (res?.status !== "created" || !code) throw new Error(`IssueMate ไม่ได้สร้าง issue (${res?.status ?? "ไม่ทราบสถานะ"})`);
  writeFileSync(SENT_FILE, JSON.stringify({ ...readSent(), [key]: code }, null, 1));
  return { status: "sent", code, analysis, at: at() };
}
