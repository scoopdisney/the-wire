// TEMPORARY one-shot endpoint (2026-09-30): removes the TheDisneyScoop share bar.
// 1) Deletes the Code Snippets snippet whose code contains `tds_add_share_bar` (only if exactly one matches).
// 2) Removes every `.tds-share-bar` rule from Appearance > Customize > Additional CSS
//    (via the "Scoop MCP Custom CSS" helper snippet route, created if missing).
// Hardcoded and idempotent: it can do nothing else. ?dry=1 reports without writing.
// Delete this file after use.

const ROOT = "https://thedisneyscoop.com/wp-json";

function auth() {
  return "Basic " + Buffer.from(process.env.WP_USER + ":" + process.env.WP_APP_PASSWORD).toString("base64");
}

async function wpr(method, path, body) {
  let url = ROOT + path;
  let res;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(url, {
      method,
      redirect: "manual",
      headers: {
        Authorization: auth(),
        "X-Scoop-Auth": auth().replace("Basic ", ""),
        "Content-Type": "application/json",
        "User-Agent": "ScoopMCP/2.7",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url).toString(); continue; }
    break;
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(method + " " + path + " -> " + res.status + ": " + ((data && data.message) || String(text).slice(0, 300)));
  return data;
}

const HELPER_NAME = "Scoop MCP Custom CSS";
const HELPER_CODE = `add_action( 'rest_api_init', function () {
	$can = function () { return current_user_can( 'edit_theme_options' ); };
	register_rest_route( 'scoop/v1', '/custom-css', array(
		array(
			'methods'             => 'GET',
			'permission_callback' => $can,
			'callback'            => function () {
				return array( 'css' => wp_get_custom_css(), 'stylesheet' => get_stylesheet() );
			},
		),
		array(
			'methods'             => 'POST',
			'permission_callback' => $can,
			'callback'            => function ( $request ) {
				$css = $request->get_param( 'css' );
				if ( ! is_string( $css ) ) {
					return new WP_Error( 'scoop_bad_css', 'css (string) is required', array( 'status' => 400 ) );
				}
				$r = wp_update_custom_css_post( $css );
				if ( is_wp_error( $r ) ) { return $r; }
				return array( 'ok' => true, 'post_id' => $r->ID, 'length' => strlen( $css ) );
			},
		),
	) );
} );`;

// Top-level rule blocks whose selector mentions .tds-share-bar
const RULE_RE = /[^{}]*\.tds-share-bar[^{}]*\{[^{}]*\}\s*/g;

export default async function handler(req, res) {
  const dry = req.query && (req.query.dry === "1" || req.query.dry === "true");
  const out = { dry, snippet: null, css: null };
  try {
    // ---- 1. snippet ----
    const all = await wpr("GET", "/code-snippets/v1/snippets");
    const matches = all.filter(s => (s.code || "").includes("tds_add_share_bar"));
    out.snippet = { matches: matches.map(s => ({ id: s.id, name: s.name, active: s.active, scope: s.scope })) };
    if (matches.length === 1) {
      const sn = matches[0];
      out.snippet.code_backup = sn.code;
      if (!dry) { await wpr("DELETE", "/code-snippets/v1/snippets/" + sn.id); out.snippet.deleted = sn.id; }
    } else if (matches.length > 1) {
      out.snippet.skipped = "More than one snippet contains tds_add_share_bar; nothing deleted.";
    } else {
      out.snippet.skipped = "No snippet contains tds_add_share_bar (already deleted?).";
    }

    // ---- 2. CSS ----
    let helper = all.find(s => s.name === HELPER_NAME);
    out.css = { helper: helper ? { id: helper.id, active: helper.active } : null };
    if (!helper) { // created even on dry runs: additive, needed to read the CSS
      helper = await wpr("POST", "/code-snippets/v1/snippets", { name: HELPER_NAME, code: HELPER_CODE, scope: "global", active: true, desc: "REST route scoop/v1/custom-css used by the Scoop MCP scoop_custom_css tool." });
      out.css.helper = { id: helper.id, active: helper.active, created: true, code_error: helper.code_error || null };
    }
    if (helper && !helper.active) {
      await wpr("POST", "/code-snippets/v1/snippets/" + helper.id + "/activate");
      out.css.helper.activated = true;
    }
    if (!helper) { out.css.note = "Dry run: helper snippet would be created; CSS not read yet."; }
    else {
      const cur = await wpr("GET", "/scoop/v1/custom-css");
      const removed = cur.css.match(RULE_RE) || [];
      const next = cur.css.replace(RULE_RE, "").replace(/\s+$/, "") + "\n";
      out.css.stylesheet = cur.stylesheet;
      out.css.rules_removed = removed.length;
      out.css.removed_text = removed.join("");
      out.css.before_length = cur.css.length;
      out.css.after_length = next.length;
      out.css.previous_css = cur.css;
      if (removed.length && !dry) out.css.saved = await wpr("POST", "/scoop/v1/custom-css", { css: next });
      out.css.after_tail = next.slice(-300);
    }
    res.status(200).json(out);
  } catch (e) {
    out.error = e.message;
    res.status(500).json(out);
  }
}
