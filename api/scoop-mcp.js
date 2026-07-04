// api/scoop-mcp.js
// Scoop MCP — a minimal Model Context Protocol server for TheDisneyScoop.com.
//
// WHY THIS EXISTS: The official WordPress.com MCP connector requires a nested
// `params` object on every write, and the Claude chat pipeline currently
// stringifies nested object arguments, breaking all writes. Every tool here
// takes ONLY flat scalar parameters (strings/numbers), which pass through
// intact. The server relays to the WordPress.com REST API with a stored token.
//
// Env vars (set in Vercel project settings):
//   WPCOM_TOKEN — WordPress.com OAuth bearer token (get via /api/token)
//   MCP_KEY     — shared secret; must match ?key= on the connector URL
//   SITE_ID     — optional, defaults to 216018568
//
// Connector URL for Claude:  https://<your-app>.vercel.app/api/scoop-mcp?key=<MCP_KEY>
// Zero npm dependencies. Node 18+ (Vercel default).

const SITE = () => process.env.SITE_ID || "216018568";
const WP = (path) => `https://public-api.wordpress.com/wp/v2/sites/${SITE()}${path}`;

async function wp(path, opts = {}) {
  const res = await fetch(WP(path), {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.WPCOM_TOKEN}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.message || json?.error || text.slice(0, 300);
    throw new Error(`WordPress ${res.status}: ${msg}`);
  }
  return json;
}

// ---- helpers ---------------------------------------------------------------

async function resolveCategory(name) {
  if (!name) return null;
  const cats = await wp(`/categories?search=${encodeURIComponent(name)}&per_page=20`);
  const hit = cats.find((c) => c.name.toLowerCase() === name.toLowerCase()) || cats[0];
  return hit ? hit.id : null;
}

async function resolveTags(csv) {
  if (!csv) return [];
  const names = csv.split(",").map((t) => t.trim()).filter(Boolean);
  const ids = [];
  for (const name of names) {
    const found = await wp(`/tags?search=${encodeURIComponent(name)}&per_page=20`);
    const hit = found.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (hit) ids.push(hit.id);
    else {
      const created = await wp(`/tags`, { method: "POST", body: JSON.stringify({ name }) });
      ids.push(created.id);
    }
  }
  return ids;
}

function yoastMeta(a) {
  const meta = {};
  if (a.focus_keyphrase) meta._yoast_wpseo_focuskw = a.focus_keyphrase;
  if (a.seo_title) meta._yoast_wpseo_title = a.seo_title;
  if (a.meta_desc) meta._yoast_wpseo_metadesc = a.meta_desc;
  return Object.keys(meta).length ? meta : undefined;
}

function postSummary(p) {
  return {
    id: p.id,
    status: p.status,
    title: p.title?.rendered || p.title?.raw || "",
    link: p.link,
    edit: `https://thedisneyscoop.com/wp-admin/post.php?post=${p.id}&action=edit`,
    modified: p.modified,
  };
}

// ---- tools (ALL parameters are flat scalars — never change this) -----------

const TOOLS = [
  {
    name: "scoop_publish_post",
    description:
      "Create a post on TheDisneyScoop.com. Handles category lookup by name, tag creation from a comma-separated list, author assignment, and Yoast SEO fields. Content is Gutenberg block markup or HTML. Status: draft, pending, publish, or future (with date_iso).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Post title, all words capitalized" },
        content: { type: "string", description: "Full post body as Gutenberg/HTML markup" },
        status: { type: "string", description: "draft | pending | publish | future", default: "pending" },
        author_id: { type: "number", description: "Numeric author ID on the site" },
        category: { type: "string", description: "Category name, e.g. 'Disneyland Resort'" },
        tags_csv: { type: "string", description: "Comma-separated tag names; missing tags are created" },
        focus_keyphrase: { type: "string", description: "Yoast focus keyphrase, 1-4 words" },
        seo_title: { type: "string", description: "Yoast SEO title" },
        meta_desc: { type: "string", description: "Yoast meta description, under 155 chars" },
        date_iso: { type: "string", description: "ISO8601 datetime, required only for status=future" },
      },
      required: ["title", "content"],
    },
    handler: async (a) => {
      const body = {
        title: a.title,
        content: a.content,
        status: a.status || "pending",
      };
      if (a.author_id) body.author = a.author_id;
      if (a.date_iso) body.date = a.date_iso;
      const catId = await resolveCategory(a.category);
      if (catId) body.categories = [catId];
      const tagIds = await resolveTags(a.tags_csv);
      if (tagIds.length) body.tags = tagIds;
      const meta = yoastMeta(a);
      if (meta) body.meta = meta;
      const post = await wp(`/posts`, { method: "POST", body: JSON.stringify(body) });
      return postSummary(post);
    },
  },
  {
    name: "scoop_update_post",
    description:
      "Update an existing post by ID. Only supplied fields change. Use for audit fixes, corrections, status changes, and Yoast updates. WARNING: status=publish goes live immediately.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "number", description: "Existing post ID" },
        title: { type: "string" },
        content: { type: "string", description: "Full replacement body (Gutenberg/HTML)" },
        status: { type: "string", description: "draft | pending | publish" },
        author_id: { type: "number" },
        category: { type: "string", description: "Category name; replaces existing categories" },
        tags_csv: { type: "string", description: "Comma-separated tags; replaces existing tags" },
        focus_keyphrase: { type: "string" },
        seo_title: { type: "string" },
        meta_desc: { type: "string" },
      },
      required: ["post_id"],
    },
    handler: async (a) => {
      const body = {};
      if (a.title) body.title = a.title;
      if (a.content) body.content = a.content;
      if (a.status) body.status = a.status;
      if (a.author_id) body.author = a.author_id;
      if (a.category) {
        const catId = await resolveCategory(a.category);
        if (catId) body.categories = [catId];
      }
      if (a.tags_csv) body.tags = await resolveTags(a.tags_csv);
      const meta = yoastMeta(a);
      if (meta) body.meta = meta;
      if (!Object.keys(body).length) throw new Error("No fields to update were provided.");
      const post = await wp(`/posts/${a.post_id}`, { method: "POST", body: JSON.stringify(body) });
      return postSummary(post);
    },
  },
  {
    name: "scoop_get_post",
    description:
      "Fetch a post by ID with raw editable content and Yoast meta. Use before updating, and for the site audit.",
    inputSchema: {
      type: "object",
      properties: { post_id: { type: "number", description: "Post ID" } },
      required: ["post_id"],
    },
    handler: async (a) => {
      const p = await wp(`/posts/${a.post_id}?context=edit`);
      return {
        ...postSummary(p),
        author: p.author,
        categories: p.categories,
        tags: p.tags,
        content: p.content?.raw || p.content?.rendered || "",
        excerpt: p.excerpt?.raw || "",
        yoast: {
          focus_keyphrase: p.meta?._yoast_wpseo_focuskw || "",
          seo_title: p.meta?._yoast_wpseo_title || "",
          meta_desc: p.meta?._yoast_wpseo_metadesc || "",
        },
      };
    },
  },
  {
    name: "scoop_list_posts",
    description:
      "List posts with filters. Returns id, title, status, link, modified. Use for finding posts, checking duplicates, and audit sequencing.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "publish | draft | pending | future | trash | any", default: "publish" },
        search: { type: "string", description: "Search term" },
        author_id: { type: "number", description: "Filter by author ID" },
        per_page: { type: "number", default: 10, description: "1-100" },
        page: { type: "number", default: 1 },
        order: { type: "string", description: "asc | desc", default: "desc" },
      },
    },
    handler: async (a) => {
      const q = new URLSearchParams();
      q.set("status", a.status || "publish");
      q.set("per_page", String(a.per_page || 10));
      q.set("page", String(a.page || 1));
      q.set("order", a.order || "desc");
      q.set("context", "edit");
      q.set("_fields", "id,title,status,link,modified,author");
      if (a.search) q.set("search", a.search);
      if (a.author_id) q.set("author", String(a.author_id));
      const posts = await wp(`/posts?${q.toString()}`);
      return posts.map(postSummary);
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
    handler: async (a) => {
      const p = await wp(`/posts/${a.post_id}`, { method: "DELETE" });
      return { id: p.id, status: "trash", title: p.title?.rendered || "" };
    },
  },
];

// ---- MCP JSON-RPC over streamable HTTP (stateless) --------------------------

function rpcResult(id, result) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }

export default async function handler(req, res) {
  // Shared-secret gate
  const key = req.query?.key || req.headers["x-api-key"];
  if (!process.env.MCP_KEY || key !== process.env.MCP_KEY) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (req.method === "GET") { res.status(405).end(); return; }
  if (req.method !== "POST") { res.status(405).end(); return; }

  const msg = req.body;
  if (!msg || msg.jsonrpc !== "2.0") {
    res.status(400).json(rpcError(null, -32700, "Parse error"));
    return;
  }

  // Notifications need no response body
  if (msg.id === undefined || msg.id === null) {
    res.status(202).end();
    return;
  }

  try {
    switch (msg.method) {
      case "initialize":
        res.status(200).json(
          rpcResult(msg.id, {
            protocolVersion: msg.params?.protocolVersion || "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: { name: "scoop-mcp", version: "1.0.0" },
          })
        );
        return;

      case "ping":
        res.status(200).json(rpcResult(msg.id, {}));
        return;

      case "tools/list":
        res.status(200).json(
          rpcResult(msg.id, {
            tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
          })
        );
        return;

      case "tools/call": {
        const tool = TOOLS.find((t) => t.name === msg.params?.name);
        if (!tool) {
          res.status(200).json(rpcError(msg.id, -32602, `Unknown tool: ${msg.params?.name}`));
          return;
        }
        let args = msg.params?.arguments || {};
        // Tolerant parsing: if the arguments arrive stringified, decode them.
        if (typeof args === "string") { try { args = JSON.parse(args); } catch { /* leave */ } }
        try {
          const out = await tool.handler(args);
          res.status(200).json(
            rpcResult(msg.id, {
              content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
            })
          );
        } catch (err) {
          res.status(200).json(
            rpcResult(msg.id, {
              content: [{ type: "text", text: `Error: ${err.message}. Check the post ID / field values and try again.` }],
              isError: true,
            })
          );
        }
        return;
      }

      default:
        res.status(200).json(rpcError(msg.id, -32601, `Method not found: ${msg.method}`));
        return;
    }
  } catch (err) {
    res.status(200).json(rpcError(msg.id, -32603, `Internal error: ${err.message}`));
  }
}
