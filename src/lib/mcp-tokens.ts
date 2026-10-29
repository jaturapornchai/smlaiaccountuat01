import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// MCP token ที่ผู้ดูแลสร้างจากหน้าเว็บ: เก็บแค่ SHA-256 ใน runs/mcp-tokens.json (ค่าจริงโชว์ครั้งเดียวตอนสร้าง)
// token หลักใน .env.local (UAT_MCP_TOKEN) ยังใช้ได้คู่กัน
export interface McpToken {
  id: string;
  name: string;
  hint: string; // 4 ตัวท้าย ไว้จำว่าเป็นตัวไหน
  createdAt: string;
  lastUsedAt?: string;
}
type Stored = McpToken & { hash: string };

const FILE = join(process.cwd(), "runs", "mcp-tokens.json");
const sha = (s: string) => createHash("sha256").update(s).digest();
// ponytail: อ่านไฟล์ทุกคำขอ (ไฟล์เล็ก) ถ้า MCP เรียกถี่มากค่อย cache ในหน่วยความจำ
const load = (): Stored[] => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []);
const save = (list: Stored[]) => writeFileSync(FILE, JSON.stringify(list, null, 2), { mode: 0o600 });
const strip = (t: Stored): McpToken => ({ id: t.id, name: t.name, hint: t.hint, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt });

export const listTokens = (): McpToken[] => load().map(strip);
export const hasTokens = () => load().length > 0;

export function createToken(name: string): { token: string; item: McpToken } {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error("ตั้งชื่อ token ก่อน เช่น Antigravity หรือ Claude Code");
  const token = `uat_${randomBytes(32).toString("hex")}`;
  const item: Stored = { id: randomBytes(6).toString("hex"), name: clean, hint: token.slice(-4), createdAt: new Date().toISOString(), hash: sha(token).toString("hex") };
  save([...load(), item]);
  return { token, item: strip(item) };
}

export function revokeToken(id: string): boolean {
  const list = load();
  const rest = list.filter((t) => t.id !== id);
  if (rest.length === list.length) return false;
  save(rest);
  return true;
}

// ตรวจ token ที่ส่งมา · บันทึกเวลาใช้ล่าสุดไม่เกินนาทีละครั้ง (MCP เรียกถี่)
export function matchToken(got: string): McpToken | null {
  if (!got) return null;
  const h = sha(got);
  const list = load();
  const hit = list.find((t) => timingSafeEqual(Buffer.from(t.hash, "hex"), h));
  if (!hit) return null;
  if (!hit.lastUsedAt || Date.now() - Date.parse(hit.lastUsedAt) > 60_000) {
    hit.lastUsedAt = new Date().toISOString();
    save(list);
  }
  return strip(hit);
}
