// Scoop Pages MCP v1.0: WordPress PAGES for TheDisneyScoop.com. Same env/auth as scoop-mcp.js.
import { run } from "./_pages-lib.js";
const S = { type: "string" }, N = { type: "number" };
const FIELDS = { title: S, content: { type: "string", description: "Gutenberg/HTML markup" },
  status: { type: "string", description: "draft | pending | publish | private" },
  parent: { type: "number", description: "Parent page ID (0 = top level)" }, slug: S,
  menu_order: N, featured_media: N, excerpt: S, seo_title: S, meta_desc: S, focus_keyphrase: S };
const TOOLS = [
  { name: "scoop_create_page", description: "Create a WordPress PAGE (not a post). Defaults to draft. Returns id, link and edit link.",
    inputSchema: { type: "object", properties: FIELDS, required: ["title", "content"] } },
  { name: "scoop_update_page", description: "Update a page by ID; only supplied fields change. status=publish goes live.",
    inputSchema: { type: "object", properties: { page_id: N, ...FIELDS }, required: ["page_id"] } },
  { name: "scoop_get_page", description: "Fetch one page with raw content, parent, featured image and Yoast meta.",
    inputSchema: { type: "object", properties: { page_id: N }, required: ["page_id"] } },
  { name: "scoop_list_pages", description: "List pages. Filters: search, status (default any), parent, per_page (max 100), page.",
    inputSchema: { type: "object", properties: { search: S, status: S, parent: N, per_page: N, page: N } } },
];
async function rpc(m) {
  const { id, method, params } = m, ok = r => ({ jsonrpc: "2.0", id, result: r });
  if (method === "initialize") return ok({ protocolVersion: (params && params.protocolVersion) || "2025-03-26",
    capabilities: { tools: {} }, serverInfo: { name: "scoop-pages", version: "1.0.0" } });
  if (method && method.startsWith("notifications/")) return null;
  if (method === "ping") return ok({});
  if (method === "tools/list") return ok({ tools: TOOLS });
  if (method === "tools/call") {
    try { const out = await run(params.name, params.arguments || {});
      return ok({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] }); }
    catch (e) { return ok({ content: [{ type: "text", text: "Error: " + e.message }], isError: true }); }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + method } };
}
export default async function handler(req, res) {
  const key = (req.query && req.query.key) || "";
  if (!process.env.MCP_KEY || key !== process.env.MCP_KEY) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { return res.status(400).json({ error: "Bad JSON" }); } }
  if (Array.isArray(b)) { const out = (await Promise.all(b.map(rpc))).filter(Boolean); return out.length ? res.json(out) : res.status(202).end(); }
  const out = await rpc(b || {}); return out ? res.json(out) : res.status(202).end();
}
