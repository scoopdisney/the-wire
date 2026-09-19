// The Wire's Anthropic proxy, locked down 2026-09-19: only The Wire's own pages may call it,
// and every request is capped to what The Wire actually sends (Sonnet 4.5, 4000 tokens, 3 searches).
const ALLOWED = ["the-wire-zeta.vercel.app", "the-wire-mattdesmondprojects.vercel.app",
  "the-wire-git-main-mattdesmondprojects.vercel.app"];
function host(v) { try { return new URL(v).host; } catch { return ""; } }
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const from = host(req.headers.origin || "") || host(req.headers.referer || "");
  if (!ALLOWED.includes(from)) return res.status(403).json({ error: "Forbidden" });
  const b = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body) || {};
  const tools = (b.tools || []).filter(t => t && t.type === "web_search_20250305")
    .map(t => ({ ...t, max_uses: Math.min(Number(t.max_uses) || 1, 3) }));
  const body = { model: "claude-sonnet-4-5", max_tokens: Math.min(Number(b.max_tokens) || 1000, 4000),
    messages: b.messages || [] };
  if (b.system) body.system = b.system;
  if (tools.length) body.tools = tools;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.VITE_ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  res.status(r.status).json(await r.json());
}
