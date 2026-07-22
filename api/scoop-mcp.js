// TheDisneyScoop MCP server — Application Password edition (permanent auth)
// Auth to WordPress: Basic auth with WP_USER + WP_APP_PASSWORD (never expires)
// Auth to this endpoint: ?key= must match MCP_KEY
// Replaces the old WPCOM_TOKEN bearer-token version.

const SITE = "https://thedisneyscoop.com/wp-json/wp/v2";

function wpAuthHeader() {
  const user = process.env.WP_USER;
  const pass = process.env.WP_APP_PASSWORD;
  if (!user || !pass) throw new Error("WP_USER / WP_APP_PASSWORD env vars are not set in Vercel.");
  return "Basic " + Buffer.from(user + ":" + pass).toString("base64");
}

async function wp(method, path, body) {
  // Follow redirects manually so the Authorization header is never dropped
  // (Node's fetch strips auth headers when a site redirects, e.g. to www).
  let url = SITE + path;
  let res;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(url, {
      method,
      redirect: "manual",
      headers: {
        Authorization: wpAuthHeader(),
        "X-Scoop-Auth": wpAuthHeader().replace("Basic ", ""),
        "Content-Type": "application/json",
        "User-Agent": "ScoopMCP/2.1",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url).toString();
      continue;
    }
    break;
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.message) ? data.message : String(text).slice(0, 300);
    let extra = "";
    if (res.status === 401 || res.status === 403) {
      extra = " [debug: user='" + (process.env.WP_USER || "MISSING") +
              "', password_set=" + (process.env.WP_APP_PASSWORD ? "yes(len " + process.env.WP_APP_PASSWORD.replace(/ /g, "").length + ")" : "NO") +
              ", final_url=" + url + "]";
    }
    throw new Error("WordPress " + res.status + ": " + msg + extra);
  }
  return data;
}

// ---------- helpers ----------

function mapStatus(s) {
  if (!s || s === "any") return "publish,future,draft,pending,private";
  return s;
}

async function resolveCategory(name) {
  if (!name) return null;
  const cats = await wp("GET", "/categories?per_page=100&search=" + encodeURIComponent(name));
  const hit = cats.find(c => c.name.toLowerCase() === name.toLowerCase()) || cats[0];
  if (!hit) throw new Error("Category not found: " + name);
  return hit.id;
}

async function resolveTags(csv) {
  if (!csv) return null;
  const names = csv.split(",").map(t => t.trim()).filter(Boolean);
  const ids = [];
  for (const name of names) {
    const found = await wp("GET", "/tags?per_page=100&search=" + encodeURIComponent(name));
    const hit = found.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (hit) { ids.push(hit.id); continue; }
    const created = await wp("POST", "/tags", { name });
    ids.push(created.id);
  }
  return ids;
}

function yoastMeta(a) {
  const meta = {};
  if (a.seo_title) meta._yoast_wpseo_title = a.seo_title;
  if (a.meta_desc) meta._yoast_wpseo_metadesc = a.meta_desc;
  if (a.focus_keyphrase) meta._yoast_wpseo_focuskw = a.focus_keyphrase;
  return Object.keys(meta).length ? meta : null;
}

function postSummary(p) {
  return {
    id: p.id,
    title: p.title && (p.title.raw ?? p.title.rendered),
    status: p.status,
    link: p.link,
    modified: p.modified,
  };
}

// ---------- tools ----------

const TOOLS = [
  {
    name: "scoop_list_posts",
    description: "List posts with filters. Returns id, title, status, link, modified. Use for finding posts, checking duplicates, and audit sequencing.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", default: "publish", description: "publish | draft | pending | future | trash | any" },
        per_page: { type: "number", default: 10, description: "1-100" },
        page: { type: "number", default: 1 },
        search: { type: "string", description: "Search term" },
        author_id: { type: "number", description: "Filter by author ID" },
        order: { type: "string", default: "desc", description: "asc | desc" },
      },
    },
  },
  {
    name: "scoop_get_post",
    description: "Fetch a post by ID with raw editable content and Yoast meta. Use before updating, and for the site audit.",
    inputSchema: {
      type: "object",
      properties: { post_id: { type: "number", description: "Post ID" } },
      required: ["post_id"],
    },
  },
  {
    name: "scoop_publish_post",
    description: "Create a post on TheDisneyScoop.com. Handles category lookup by name, tag creation from a comma-separated list, author assignment, and Yoast SEO fields. Content is Gutenberg block markup or HTML. Status: draft, pending, publish, or future (with date_iso).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Post title, all words capitalized" },
        content: { type: "string", description: "Full post body as Gutenberg/HTML markup" },
        status: { type: "string", default: "pending", description: "draft | pending | publish | future" },
        date_iso: { type: "string", description: "ISO8601 datetime, required only for status=future" },
        category: { type: "string", description: "Category name, e.g. 'Disneyland Resort'" },
        tags_csv: { type: "string", description: "Comma-separated tag names; missing tags are created" },
        author_id: { type: "number", description: "Numeric author ID on the site" },
        seo_title: { type: "string", description: "Yoast SEO title" },
        meta_desc: { type: "string", description: "Yoast meta description, under 155 chars" },
        focus_keyphrase: { type: "string", description: "Yoast focus keyphrase, 1-4 words" },
      },
      required: ["content", "title"],
    },
  },
  {
    name: "scoop_update_post",
    description: "Update an existing post by ID. Only supplied fields change. Use for audit fixes, corrections, status changes, and Yoast updates. WARNING: status=publish goes live immediately.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "number", description: "Existing post ID" },
        title: { type: "string" },
        content: { type: "string", description: "Full replacement body (Gutenberg/HTML)" },
        status: { type: "string", description: "draft | pending | publish" },
        category: { type: "string", description: "Category name; replaces existing categories" },
        tags_csv: { type: "string", description: "Comma-separated tags; replaces existing tags" },
        author_id: { type: "number" },
        seo_title: { type: "string" },
        meta_desc: { type: "string" },
        focus_keyphrase: { type: "string" },
      },
      required: ["post_id"],
    },
  },
  {
    name: "scoop_trash_post",
    description: "Move a post to trash (recoverable in wp-admin for 30 days). Confirm with the user before calling.",
    inputSchema: {
      type: "object",
      properties: { post_id: { type: "number", description: "Post ID to trash" } },
      required: ["post_id"],
    },
  },
];

async function runTool(name, a) {
  a = a || {};
  switch (name) {
    case "scoop_list_posts": {
      const q = new URLSearchParams({
        context: "edit",
        status: mapStatus(a.status),
        per_page: String(Math.min(Math.max(a.per_page || 10, 1), 100)),
        page: String(a.page || 1),
        order: a.order === "asc" ? "asc" : "desc",
      });
      if (a.search) q.set("search", a.search);
      if (a.author_id) q.set("author", String(a.author_id));
      const posts = await wp("GET", "/posts?" + q.toString());
      return posts.map(postSummary);
    }
    case "scoop_get_post": {
      const p = await wp("GET", "/posts/" + a.post_id + "?context=edit");
      return {
        ...postSummary(p),
        date: p.date,
        author: p.author,
        categories: p.categories,
        tags: p.tags,
        content: p.content && p.content.raw,
        excerpt: p.excerpt && p.excerpt.raw,
        yoast: {
          seo_title: p.meta && p.meta._yoast_wpseo_title,
          meta_desc: p.meta && p.meta._yoast_wpseo_metadesc,
          focus_keyphrase: p.meta && p.meta._yoast_wpseo_focuskw,
        },
      };
    }
    case "scoop_publish_post": {
      const body = {
        title: a.title,
        content: a.content,
        status: a.status || "pending",
      };
      if (a.status === "future") {
        if (!a.date_iso) throw new Error("date_iso is required when status=future");
        body.date = a.date_iso;
      }
      if (a.author_id) body.author = a.author_id;
      const cat = await resolveCategory(a.category);
      if (cat) body.categories = [cat];
      const tags = await resolveTags(a.tags_csv);
      if (tags) body.tags = tags;
      const meta = yoastMeta(a);
      if (meta) body.meta = meta;
      const p = await wp("POST", "/posts", body);
      return { ...postSummary(p), edit_link: "https://thedisneyscoop.com/wp-admin/post.php?post=" + p.id + "&action=edit" };
    }
    case "scoop_update_post": {
      const body = {};
      if (a.title !== undefined) body.title = a.title;
      if (a.content !== undefined) body.content = a.content;
      if (a.status !== undefined) body.status = a.status;
      if (a.author_id !== undefined) body.author = a.author_id;
      const cat = await resolveCategory(a.category);
      if (cat) body.categories = [cat];
      const tags = await resolveTags(a.tags_csv);
      if (tags) body.tags = tags;
      const meta = yoastMeta(a);
      if (meta) body.meta = meta;
      const p = await wp("POST", "/posts/" + a.post_id, body);
      return { ...postSummary(p), updated_fields: Object.keys(body) };
    }
    case "scoop_trash_post": {
      const p = await wp("DELETE", "/posts/" + a.post_id);
      return { id: p.id, status: p.status, note: "Moved to trash; recoverable in wp-admin for 30 days." };
    }
    default:
      throw new Error("Unknown tool: " + name);
  }
}

// ---------- MCP JSON-RPC over HTTP ----------

function rpcResult(id, result) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }

async function handleMessage(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: (params && params.protocolVersion) || "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "scoop-mcp", version: "2.2.0" },
    });
  }
  if (method === "notifications/initialized" || (method && method.startsWith("notifications/"))) {
    return null; // notifications get no response
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: TOOLS });
  if (method === "tools/call") {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    try {
      const out = await runTool(name, args);
      return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
    } catch (e) {
      return rpcResult(id, {
        content: [{ type: "text", text: "Error: " + e.message + ". Check the post ID / field values and try again." }],
        isError: true,
      });
    }
  }
  return rpcError(id, -32601, "Method not found: " + method);
}

export default async function handler(req, res) {
  // Endpoint auth: shared secret in the URL
  const key = (req.query && req.query.key) || "";
  if (!process.env.MCP_KEY || key !== process.env.MCP_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method === "GET") {
    // No SSE stream offered; clients fall back to plain HTTP POST
    res.status(405).json({ error: "Use POST" });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body) {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses = [];
  for (const m of messages) {
    const r = await handleMessage(m);
    if (r) responses.push(r);
  }

  if (responses.length === 0) {
    res.status(202).end();
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.status(200).json(Array.isArray(body) ? responses : responses[0]);
}
