import { askBrain } from "./brain";
import { getSettings } from "./swarm-store";

// MCP ของ SML AI Account (sml-ai-account-mcp อ่านอย่างเดียว) — ให้ Tester ดูโครงสร้าง/workflow ของระบบใหม่ แล้วตรวจตามระบบของ SML ไม่ใช่ตามที่ AI เดา
// URL ตามหน้า MCP Token ของ SML (frontend/account/admin/screens/McpTokenScreen.tsx:136 = <เว็บ>/api/mcp) · JSON-RPC แบบ stateless (backend mcp/gateway.go:1052 tools/list, :1061 tools/call)
// ต้องมี SML_MCP_TOKEN (smlmcp_ro_… ลุงจืดสร้างที่หน้า MCP Token ของ SML) ใน .env.local — ไม่มี = ข้ามทั้งหมด งานเดินแบบเดิม
const url = () => process.env.SML_MCP_URL || `${getSettings().erpTargetUrl.replace(/\/+$/, "")}/api/mcp`;
type Tool = { name: string; description?: string; inputSchema?: unknown };
let catalog: { at: number; tools: Tool[] } | undefined;

async function rpc(method: string, params: object) {
  const token = process.env.SML_MCP_TOKEN;
  if (!token) throw new Error("ยังไม่ได้ตั้ง SML_MCP_TOKEN ใน .env.local");
  const res = await fetch(url(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) throw new Error(`MCP ของ SML ตอบ ${j?.error?.message ?? `HTTP ${res.status}`}`);
  return j.result;
}

// undefined = ดูรายชื่อไม่ได้ (ไม่รู้ว่ามีอะไร → ห้ามขอเครื่องมือใหม่) · แคช 10 นาที: SML เพิ่มเครื่องมือแล้ว Tester เห็นเองภายใน 10 นาที
export async function smlTools(): Promise<Tool[] | undefined> {
  if (!process.env.SML_MCP_TOKEN) return undefined;
  if (catalog && Date.now() - catalog.at < 10 * 60_000) return catalog.tools;
  const tools = (await rpc("tools/list", {}).catch(() => undefined))?.tools;
  if (!Array.isArray(tools)) return undefined;
  catalog = { at: Date.now(), tools };
  return tools;
}

export async function smlCall(name: string, args: object): Promise<string> {
  const r = await rpc("tools/call", { name, arguments: args });
  const text = ((r?.content ?? []) as { text?: string }[]).map((c) => c.text ?? "").join("\n");
  if (r?.isError) throw new Error(`MCP ของ SML: ${text.slice(0, 200)}`);
  return text;
}

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    calls: { type: "array", items: { type: "object", properties: { tool: { type: "string" }, args: { type: "object" } }, required: ["tool"] } },
    needMcp: { type: "object", properties: { name: { type: "string" }, why: { type: "string" }, input: { type: "string" }, output: { type: "string" } } },
  },
  required: ["calls"],
};
const PLAN = `คุณเตรียมข้อมูลให้งานของ UAT Tester ที่ตรวจ SML AI Account ตามระบบของ SML เอง
เลือกเครื่องมือ MCP ของ SML AI Account (อ่านอย่างเดียว) ที่ให้โครงสร้าง workflow หรือข้อมูลที่งานนี้ต้องใช้ ไม่เกิน 3 ครั้ง ใช้เฉพาะชื่อเครื่องมือและ input ตามรายการ
ถ้าไม่มีเครื่องมือไหนให้ข้อมูลที่จำเป็นได้ ให้ระบุ needMcp {name: "sml_<ชื่อ>", why, input, output} เพื่อขอ SML AI Account สร้างเพิ่ม · งานนี้ไม่ต้องใช้ข้อมูลเพิ่ม ตอบ calls ว่าง
ตอบ JSON เท่านั้น`;

// ก่อนงาน AI ที่ตัดสินพฤติกรรมของ SML (เขียน/ซ่อมสคริปต์ คัดรอบพัง วิเคราะห์ issue): เรียก MCP ของ SML ตามที่งานต้องใช้ → ผลแนบเป็นหลักฐานให้ AI
// ขาดเครื่องมือ → requestMcp เปิด IssueMate ขอ SML AI Account สร้างเพิ่ม · ไม่มี token/MCP ล่ม = "" งานเดินต่อแบบเดิม
// ponytail: แคชตามข้อความงาน (หลายบอทรับคำสั่งเดียวกัน = วางแผนครั้งเดียว) ล้างทิ้งเมื่อเกิน 50 งาน
const ctxCache = new Map<string, Promise<string>>();
export function smlContext(task: string): Promise<string> {
  if (ctxCache.size > 50) ctxCache.clear();
  if (!ctxCache.has(task)) ctxCache.set(task, buildContext(task).then((r) => (r || ctxCache.delete(task), r))); // ว่าง (MCP ล่ม) ไม่แคช
  return ctxCache.get(task)!;
}

async function buildContext(task: string): Promise<string> {
  const tools = await smlTools();
  if (!tools?.length) return "";
  try {
    const list = tools.map((t) => `- ${t.name}: ${t.description ?? ""} · input ${JSON.stringify(t.inputSchema ?? {})}`.slice(0, 800)).join("\n");
    const text = await askBrain("sml-mcp", getSettings().brainModel, PLAN, `งาน: ${task.slice(0, 3000)}\n\nเครื่องมือ MCP ของ SML AI Account ที่มี:\n${list}`, [], PLAN_SCHEMA);
    const plan = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const out: string[] = [];
    for (const c of ([] as { tool?: string; args?: object }[]).concat(plan.calls ?? []).slice(0, 3)) {
      if (!tools.some((t) => t.name === c.tool)) continue; // ชื่อที่ AI แต่งขึ้น ไม่เรียก
      const r = await smlCall(c.tool!, c.args ?? {}).catch((e: Error) => `(เรียกไม่สำเร็จ: ${e.message})`);
      out.push(`### ${c.tool} ${JSON.stringify(c.args ?? {})}\n${r.slice(0, 3000)}`);
    }
    const { requestMcp } = await import("./issuemate"); // import ตอนใช้ กันวน issuemate ↔ sml-mcp
    const asked = await requestMcp(plan.needMcp, task, tools.map((t) => t.name));
    if (asked) out.push(asked);
    return out.length ? `ข้อมูลจาก MCP ของ SML AI Account (ระบบจริง ใช้เป็นหลักฐานได้):\n${out.join("\n\n")}` : "";
  } catch {
    return "";
  }
}
