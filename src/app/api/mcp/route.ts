import { createHash, timingSafeEqual } from "node:crypto";
import { touchLink } from "@/lib/activity";
import { TOOLS, callTool } from "@/lib/mcp";
import { hasTokens, matchToken } from "@/lib/mcp-tokens";

export const dynamic = "force-dynamic";

// MCP แบบ Streamable HTTP ไร้ session: รองรับทั้งแบบใหม่ (2026-07-28, _meta ทุกคำขอ) และแบบเก่า (initialize, ≤ 2025-11-25)
const MODERN = ["2026-07-28"];
const LEGACY = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SERVER = { name: "sml-uat-tester", version: "1.0.0" };
const INSTRUCTIONS =
  "UAT tester for SML AI Account (Thai ERP) on its demo database. Need data you can freely change (destructive, bulk, admin or clean-state tests)? You may always create your own copy of smldemo with test_db and point db.* steps at it — never mutate shared smldemo beyond UAT-prefixed rows; drop it when done. Loop: run → failed runs auto-open IssueMate issues (code returned) → fix the code → run {issue:code} to re-test (result is posted on the issue). Create sample data whenever a test needs it (UAT-prefixed codes/doc numbers in smldemo through the ERP API or screens, cleaned up in the script's cleanup; anything in your own test_db copy). Every test checks three layers: screen/API → the database rows (db.query) → the related report (open it or call /api/process/report/run), and the totals must agree; see e2e-sale-credit-receipt for the pattern. A failed run opens an IssueMate issue automatically so the fix can be worked out there. Follow results with events; audit what the tester itself did (AI calls, web searches, errors, slow steps, restarts) with logs. Add tests with save_script (copy a script from scripts {id}). Persona: you are an accountant, a Thai tax lawyer (VAT, tax invoice/e-Tax, withholding tax, P.P.30, P.N.D.) and a developer in one — skeptical: never trust a number on screen until it matches the database, the reports and the law; research supporting facts from official sources (Revenue Department rd.go.th, Royal Gazette, TFAC/TFRS) and how other Thai accounting software handles the same case, and cite URLs. Stay focused: only claim what you have evidence for, and never build or propose new features/screens on your own — report only where the current system is wrong; the owner orders new work through IssueMate. You use SML AI Account the way a Thai SME user does (accounting, sales, purchasing or stock staff), testing to find mistakes — work the way that user does (open menus, read the Thai labels, fill, save, edit, search, view/print reports) and judge results as they would (wrong money/tax/stock/GL is the worst). You are also strong in SQL and the SML data model: verify in the database (db.query) and check whole business flows (e.g. quotation → sales order → invoice → VAT → GL → stock) so every related table matches what the screen shows. Write script titles, step titles and notify texts in plain Thai.";

type Json = Record<string, unknown>;
const reply = (body: Json | null, status = 200) => (body ? Response.json(body, { status }) : new Response(null, { status }));
const rpcError = (id: unknown, code: number, message: string, status = 200, data?: Json) =>
  reply({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } }, status);

const digest = (s: string) => createHash("sha256").update(s).digest();
function authorized(req: Request) {
  const want = process.env.UAT_MCP_TOKEN ?? "";
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  // token หลักจาก .env.local หรือ token ที่ผู้ดูแลสร้างจากหน้าเว็บ (src/lib/mcp-tokens.ts)
  return (!!want && !!got && timingSafeEqual(digest(want), digest(got))) || !!matchToken(got);
}
const decode = (v: string | null) => {
  const m = v?.match(/^=\?base64\?(.*)\?=$/);
  return m ? Buffer.from(m[1], "base64").toString("utf8") : v;
};

// ชื่อ AI ที่ต่ออยู่: แบบใหม่ส่งมาทุกคำขอ, แบบเก่าส่งตอน initialize → จำไว้ตาม User-Agent
declare global {
  // eslint-disable-next-line no-var
  var __mcp_clients: Map<string, string> | undefined;
}
const clients = (global.__mcp_clients ??= new Map());

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== "null" && new URL(origin).host !== req.headers.get("host")) return rpcError(null, -32600, "Origin not allowed", 403);
  if (!process.env.UAT_MCP_TOKEN && !hasTokens()) return rpcError(null, -32600, "MCP disabled: no token (set UAT_MCP_TOKEN or create one on the web)", 503);
  if (!authorized(req)) return new Response('{"error":"unauthorized"}', { status: 401, headers: { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="uat-tester"' } });

  const msg = (await req.json().catch(() => null)) as Json | null;
  if (!msg || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id, -32600, "Invalid Request", 400);
  const { id, method } = msg as { id?: string | number | null; method: string };
  const params = (msg.params ?? {}) as Json;
  if (id === undefined || id === null) return reply(null, 202); // notification เช่น notifications/initialized

  const meta = (params._meta ?? {}) as Json;
  const version = meta["io.modelcontextprotocol/protocolVersion"] as string | undefined;
  const ua = req.headers.get("user-agent") ?? "";
  const named = (meta["io.modelcontextprotocol/clientInfo"] as Json | undefined)?.name as string | undefined;
  if (version !== undefined) {
    if (req.headers.get("mcp-protocol-version") !== version) return rpcError(id, -32020, "Header mismatch: MCP-Protocol-Version", 400);
    if (req.headers.get("mcp-method") !== method) return rpcError(id, -32020, "Header mismatch: Mcp-Method", 400);
    if (method === "tools/call" && decode(req.headers.get("mcp-name")) !== params.name) return rpcError(id, -32020, "Header mismatch: Mcp-Name", 400);
    if (!MODERN.includes(version)) return rpcError(id, -32022, "Unsupported protocol version", 400, { supported: [...MODERN, ...LEGACY], requested: version });
  }
  const ok = (result: Json) => reply({ jsonrpc: "2.0", id, result: version ? { resultType: "complete", ...result } : result });

  switch (method) {
    case "initialize": {
      const info = params.clientInfo as Json | undefined;
      if (info?.name) clients.set(ua, String(info.name));
      const asked = String(params.protocolVersion ?? "");
      return ok({ protocolVersion: LEGACY.includes(asked) ? asked : LEGACY[0], capabilities: { tools: {} }, serverInfo: SERVER, instructions: INSTRUCTIONS });
    }
    case "server/discover":
      return ok({ supportedVersions: [...MODERN, ...LEGACY], capabilities: { tools: {} }, _meta: { "io.modelcontextprotocol/serverInfo": SERVER }, instructions: INSTRUCTIONS });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = String(params.name ?? "");
      const client = named ?? clients.get(ua) ?? (ua.split(/[\s/]/)[0] || "AI");
      touchLink(client, name);
      try {
        const text = await callTool(name, (params.arguments ?? {}) as Json, client, req.signal);
        return ok({ content: [{ type: "text", text }] });
      } catch (e) {
        return ok({ content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true });
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`, version ? 404 : 200);
  }
}

const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
