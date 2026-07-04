// api/token.js
// One-time helper: gets a WordPress.com bearer token for the Scoop MCP server.
// Visit https://<your-app>.vercel.app/api/token, tap Connect, approve, copy token.
// Uses the same OAuth client as The Wire (139851). If WordPress rejects the
// redirect, add this page's URL as an additional Redirect URI at
// developer.wordpress.com/apps (edit app 139851), then retry.

export default function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scoop MCP Token</title>
<style>
  body { background:#101418; color:#E8ECEF; font-family: Palatino, serif; max-width:560px; margin:40px auto; padding:0 20px; }
  a.btn, button { display:inline-block; border:1px solid #2A333C; background:#181E24; color:#E8ECEF; padding:12px 20px; font-size:15px; text-decoration:none; cursor:pointer; }
  a.btn:hover, button:hover { border-color:#F2B04E; }
  code { font-family:Menlo, Consolas, monospace; font-size:12px; word-break:break-all; display:block; background:#181E24; border:1px solid #2A333C; padding:12px; margin:14px 0; }
  .dim { color:#8A97A3; font-size:14px; line-height:1.5; }
</style></head><body>
<h2 style="font-style:italic">Scoop MCP — get token</h2>
<div id="out">
  <p class="dim">Step 1: Connect to WordPress.com and approve access for TheDisneyScoop.</p>
  <a class="btn" id="go" href="#">Connect WordPress.com</a>
</div>
<script>
  var here = location.origin + location.pathname;
  document.getElementById('go').href =
    'https://public-api.wordpress.com/oauth2/authorize?client_id=139851&redirect_uri=' +
    encodeURIComponent(here) + '&response_type=token&scope=global';
  var m = location.hash.match(/access_token=([^&]+)/);
  if (m) {
    var tok = decodeURIComponent(m[1]);
    document.getElementById('out').innerHTML =
      '<p class="dim">Token received. Copy it, then in Vercel: Project → Settings → Environment Variables → add <b>WPCOM_TOKEN</b> with this value, and <b>MCP_KEY</b> with a long random string. Redeploy.</p>' +
      '<code id="tok"></code><button onclick="navigator.clipboard.writeText(document.getElementById(\\'tok\\').textContent)">Copy token</button>' +
      '<p class="dim">Then delete this file (api/token.js) from the repo — it is only needed once.</p>';
    document.getElementById('tok').textContent = tok;
    history.replaceState(null, '', here);
  }
</script>
</body></html>`);
}
