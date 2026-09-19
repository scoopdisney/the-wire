// Scoop Pages helpers (not a route: underscore prefix). Used by api/scoop-pages.js.
const SITE = "https://thedisneyscoop.com/wp-json/wp/v2";
function auth() {
  const u = process.env.WP_USER, p = process.env.WP_APP_PASSWORD;
  if (!u || !p) throw new Error("WP_USER / WP_APP_PASSWORD not set");
  return Buffer.from(u + ":" + p).toString("base64");
}
async function wp(method, path, body) {
  let url = SITE + path, res;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(url, { method, redirect: "manual", headers: {
      Authorization: "Basic " + auth(), "X-Scoop-Auth": auth(),
      "Content-Type": "application/json", "User-Agent": "ScoopPages/1.0" },
      body: body ? JSON.stringify(body) : undefined });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url).toString(); continue; }
    break;
  }
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  if (!res.ok) throw new Error("WordPress " + res.status + ": " + ((d && d.message) || String(t).slice(0, 300)));
  return d;
}
function body(a) {
  const b = {};
  for (const k of ["title", "content", "status", "parent", "slug", "menu_order", "featured_media", "excerpt"])
    if (a[k] !== undefined && a[k] !== null) b[k] = a[k];
  const m = {};
  if (a.seo_title) m._yoast_wpseo_title = a.seo_title;
  if (a.meta_desc) m._yoast_wpseo_metadesc = a.meta_desc;
  if (a.focus_keyphrase) m._yoast_wpseo_focuskw = a.focus_keyphrase;
  if (Object.keys(m).length) b.meta = m;
  return b;
}
const sum = p => ({ id: p.id, title: p.title && (p.title.raw ?? p.title.rendered), status: p.status,
  parent: p.parent, link: p.link, modified: p.modified,
  edit_link: "https://thedisneyscoop.com/wp-admin/post.php?post=" + p.id + "&action=edit" });
export async function run(name, a = {}) {
  if (name === "scoop_create_page") { const b = body(a); b.status = b.status || "draft"; return sum(await wp("POST", "/pages", b)); }
  if (name === "scoop_update_page") { const b = body(a); return { ...sum(await wp("POST", "/pages/" + a.page_id, b)), updated_fields: Object.keys(b) }; }
  if (name === "scoop_get_page") { const p = await wp("GET", "/pages/" + a.page_id + "?context=edit");
    return { ...sum(p), featured_media: p.featured_media, menu_order: p.menu_order, slug: p.slug, meta: p.meta,
      content: p.content && (p.content.raw ?? p.content.rendered) }; }
  if (name === "scoop_list_pages") {
    const q = new URLSearchParams({ context: "edit", status: a.status || "any",
      per_page: String(Math.min(Math.max(a.per_page || 20, 1), 100)), page: String(a.page || 1) });
    if (a.search) q.set("search", a.search);
    if (a.parent !== undefined) q.set("parent", String(a.parent));
    return (await wp("GET", "/pages?" + q)).map(sum);
  }
  throw new Error("Unknown tool: " + name);
}
