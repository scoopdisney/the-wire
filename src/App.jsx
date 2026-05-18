    import { useState, useEffect } from "react";

const STORAGE_KEY = "tweet_article_tracker";
const WP_SETTINGS_KEY = "wp_settings";
const AUTHORS_KEY = "topic_authors";

function timeAgo(dateStr) {
  if (!dateStr) return "Never checked";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function bodyToHtml(body) {
  return body.split("\n\n").map(block => {
    if (block.startsWith("## ")) return `<h2>${block.replace("## ", "")}</h2>`;
    return `<p>${block}</p>`;
  }).join("\n");
}

// Match topic to author by keyword
function resolveAuthor(topic, topicAuthors) {
  if (!topic || !topicAuthors.length) return null;
  const lower = topic.toLowerCase();
  const match = topicAuthors.find(ta => lower.includes(ta.keyword.toLowerCase()));
  return match ? match.author : null;
}

const Icons = {
  Newsletter: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 4h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/><path d="M4 4l8 8 8-8"/>
    </svg>
  ),
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  Trash: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
    </svg>
  ),
  Refresh: ({ spinning }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ animation: spinning ? "spin 1s linear infinite" : "none" }}>
      <path d="M23 4v6h-6M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
    </svg>
  ),
  Article: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
    </svg>
  ),
  Settings: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  User: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  WordPress: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm-1.5 14.5l-3-8.5h1.5l1.5 4.5 1.5-4.5H13l1.5 4.5 1.5-4.5H17.5l-3 8.5-1.5-4-1.5 4z"/>
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  ),
  Xmark: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  ),
  Tag: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  )
};

const inputStyle = {
  width: "100%", padding: "8px 11px", marginBottom: "10px",
  border: "1.5px solid #c8b99a", borderRadius: "4px",
  fontFamily: "'Source Serif 4', serif", fontSize: "0.85rem",
  background: "#fff", outline: "none", color: "#1a1a2e"
};

const darkInputStyle = {
  ...inputStyle,
  marginBottom: 0,
  background: "#2a3547", color: "#f5f0e8", borderColor: "#3a4a5e"
};

const labelStyle = {
  display: "block", fontSize: "0.7rem", textTransform: "uppercase",
  letterSpacing: "0.1em", color: "#8a7a5a", fontFamily: "'Source Serif 4', serif",
  marginBottom: "4px", fontWeight: 600
};

const darkLabelStyle = { ...labelStyle, color: "#a0946e" };

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [newHandle, setNewHandle] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [activeArticle, setActiveArticle] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [publishingId, setPublishingId] = useState(null);
  const [publishStatus, setPublishStatus] = useState(null);
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Panel tabs: 'wp' | 'authors'
  const [activePanel, setActivePanel] = useState(null);

  // WP settings
  const [wpSiteUrl, setWpSiteUrl] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");
  const [wpSaved, setWpSaved] = useState(false);
  const [testingWp, setTestingWp] = useState(false);
  const [wpTestResult, setWpTestResult] = useState(null);
  // WP author IDs cache: { authorName: wpUserId }
  const [wpAuthorIds, setWpAuthorIds] = useState({});

  // Topic authors
  const [topicAuthors, setTopicAuthors] = useState([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newAuthor, setNewAuthor] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) { try { setAccounts(JSON.parse(stored)); } catch {} }
    const wp = localStorage.getItem(WP_SETTINGS_KEY);
    if (wp) {
      try {
        const { siteUrl, username, appPassword } = JSON.parse(wp);
        setWpSiteUrl(siteUrl || ""); setWpUsername(username || ""); setWpAppPassword(appPassword || "");
        setWpSaved(true);
      } catch {}
    }
    const ta = localStorage.getItem(AUTHORS_KEY);
    if (ta) { try { setTopicAuthors(JSON.parse(ta)); } catch {} }
  }, []);

  const saveAccounts = (accs) => { setAccounts(accs); localStorage.setItem(STORAGE_KEY, JSON.stringify(accs)); };
  const saveTopicAuthors = (ta) => { setTopicAuthors(ta); localStorage.setItem(AUTHORS_KEY, JSON.stringify(ta)); };

  const saveWpSettings = () => {
    localStorage.setItem(WP_SETTINGS_KEY, JSON.stringify({ siteUrl: wpSiteUrl.replace(/\/$/, ""), username: wpUsername, appPassword: wpAppPassword }));
    setWpSaved(true); setWpTestResult(null); setActivePanel(null);
  };

  const testWpConnection = async () => {
    setTestingWp(true); setWpTestResult(null);
    try {
      const base = wpSiteUrl.replace(/\/$/, "");
      const creds = btoa(`${wpUsername}:${wpAppPassword}`);
      const res = await fetch(`${base}/wp-json/wp/v2/users/me`, { headers: { Authorization: `Basic ${creds}` } });
      if (res.ok) {
        const data = await res.json();
        setWpTestResult({ success: true, message: `Connected as ${data.name}` });
      } else {
        setWpTestResult({ success: false, message: `Auth failed (${res.status}). Check your credentials.` });
      }
    } catch { setWpTestResult({ success: false, message: "Could not reach your site. Check the URL." }); }
    finally { setTestingWp(false); }
  };

  // Look up WP user ID by display name
  const resolveWpAuthorId = async (authorName, base, creds) => {
    if (wpAuthorIds[authorName]) return wpAuthorIds[authorName];
    try {
      const res = await fetch(`${base}/wp-json/wp/v2/users?search=${encodeURIComponent(authorName)}&per_page=5`, {
        headers: { Authorization: `Basic ${creds}` }
      });
      if (res.ok) {
        const users = await res.json();
        const match = users.find(u => u.name.toLowerCase() === authorName.toLowerCase() || u.slug.toLowerCase() === authorName.toLowerCase());
        if (match) {
          setWpAuthorIds(prev => ({ ...prev, [authorName]: match.id }));
          return match.id;
        }
      }
    } catch {}
    return null;
  };

  const addAccount = () => {
    const handle = newHandle.replace(/^@/, "").trim();
    if (!handle) return;
    if (accounts.find(a => a.handle.toLowerCase() === handle.toLowerCase())) { setError("Account already added."); return; }
    saveAccounts([...accounts, { id: Date.now(), handle, topic: newTopic.trim() || "general news", lastChecked: null, lastArticle: null, tweets: [] }]);
    setNewHandle(""); setNewTopic(""); setShowAddForm(false); setError("");
  };

  const removeAccount = (id) => {
    saveAccounts(accounts.filter(a => a.id !== id));
    if (activeArticle?.id === id) setActiveArticle(null);
  };

  const addTopicAuthor = () => {
    const kw = newKeyword.trim();
    const au = newAuthor.trim();
    if (!kw || !au) return;
    saveTopicAuthors([...topicAuthors, { id: Date.now(), keyword: kw, author: au }]);
    setNewKeyword(""); setNewAuthor("");
  };

  const removeTopicAuthor = (id) => saveTopicAuthors(topicAuthors.filter(ta => ta.id !== id));

  const fetchAndGenerate = async (account) => {
    setLoadingId(account.id); setError(""); setPublishStatus(null);
    const assignedAuthor = resolveAuthor(account.topic, topicAuthors);
    try {
      const sinceText = account.lastChecked
        ? `since ${new Date(account.lastChecked).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
        : "recently";

      const prompt = `You are an AI journalist assistant for a Disney Parks and entertainment news website. The user tracks the X (Twitter) account @${account.handle} for updates about "${account.topic}".

Simulate 3-5 realistic, plausible tweets that @${account.handle} might have posted ${sinceText} about "${account.topic}". Then write a full editorial article based on those tweets.

Also generate complete Yoast SEO fields for the article. The focus keyphrase should be the single most important search term (2-4 words). The SEO title should be under 60 characters. The meta description must be under 155 characters and include a call to action. The slug should be lowercase, hyphenated, no stop words.

Respond ONLY with a JSON object in this exact format (no markdown, no preamble):
{
  "tweets": [
    { "text": "tweet text here", "date": "May 15, 2026" }
  ],
  "article": {
    "headline": "article headline here",
    "subheadline": "one sentence subheadline",
    "body": "full article body here, minimum 4 paragraphs, written in a polished editorial style with subheadings. Use \\n\\n to separate paragraphs. Use ## before subheadings."
  },
  "yoast": {
    "focusKeyphrase": "2-4 word keyphrase",
    "seoTitle": "SEO title under 60 chars",
    "metaDescription": "Meta description under 155 chars with a CTA",
    "slug": "url-friendly-slug"
  }
}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, messages: [{ role: "user", content: prompt }] })
      });
      const data = await response.json();
      const raw = data.content?.find(b => b.type === "text")?.text || "";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      const updated = accounts.map(a => a.id === account.id
        ? { ...a, lastChecked: new Date().toISOString(), lastArticle: parsed.article, tweets: parsed.tweets, yoast: parsed.yoast, assignedAuthor }
        : a
      );
      saveAccounts(updated);
      setActiveArticle({ id: account.id, handle: account.handle, topic: account.topic, assignedAuthor, ...parsed });
    } catch { setError("Failed to generate article. Please try again."); }
    finally { setLoadingId(null); }
  };

  const publishToWordPress = async () => {
    if (!activeArticle?.article) return;
    const wp = localStorage.getItem(WP_SETTINGS_KEY);
    if (!wp) { setPublishStatus({ type: "error", message: "WordPress not configured. Open Settings first." }); return; }
    const { siteUrl, username, appPassword } = JSON.parse(wp);
    setPublishingId(activeArticle.id); setPublishStatus(null);
    try {
      const base = siteUrl.replace(/\/$/, "");
      const creds = btoa(`${username}:${appPassword}`);
      const yoast = activeArticle.yoast || {};
      const assignedAuthor = activeArticle.assignedAuthor;

      // Build post body
      const postBody = {
        title: activeArticle.article.headline,
        content: bodyToHtml(activeArticle.article.body),
        excerpt: activeArticle.article.subheadline,
        slug: yoast.slug || "",
        status: "draft",
        meta: {
          // Yoast SEO meta fields
          _yoast_wpseo_focuskw: yoast.focusKeyphrase || "",
          _yoast_wpseo_title: yoast.seoTitle || "",
          _yoast_wpseo_metadesc: yoast.metaDescription || "",
        }
      };

      // Resolve author ID if set
      if (assignedAuthor) {
        const authorId = await resolveWpAuthorId(assignedAuthor, base, creds);
        if (authorId) postBody.author = authorId;
      }

      const res = await fetch(`${base}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${creds}` },
        body: JSON.stringify(postBody)
      });

      if (res.ok) {
        const data = await res.json();
        setPublishStatus({ type: "success", message: `Draft published${assignedAuthor ? ` by ${assignedAuthor}` : ""}!`, url: `${base}/wp-admin/post.php?post=${data.id}&action=edit` });
      } else {
        const err = await res.json().catch(() => ({}));
        setPublishStatus({ type: "error", message: err.message || `Failed (${res.status}). Check your credentials.` });
      }
    } catch { setPublishStatus({ type: "error", message: "Could not reach WordPress. Check your site URL." }); }
    finally { setPublishingId(null); }
  };

  const renderArticleBody = (body) => body.split("\n\n").map((block, i) => {
    if (block.startsWith("## ")) return <h3 key={i} style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.1rem", fontWeight: 700, marginTop: "1.5rem", marginBottom: "0.5rem", color: "#1a1a2e" }}>{block.replace("## ", "")}</h3>;
    return <p key={i} style={{ marginBottom: "1rem", lineHeight: 1.75, color: "#2d2d2d" }}>{block}</p>;
  });

  const wpConfigured = wpSaved && wpSiteUrl && wpUsername && wpAppPassword;

  const panelBtnStyle = (id) => ({
    display: "flex", alignItems: "center", gap: "7px", padding: "7px 14px",
    border: `1.5px solid ${activePanel === id ? "#f5c842" : "rgba(255,255,255,0.2)"}`,
    borderRadius: "5px", cursor: "pointer",
    background: activePanel === id ? "rgba(245,200,66,0.15)" : "transparent",
    color: "#f5f0e8", fontFamily: "'Source Serif 4', serif", fontSize: "0.78rem", transition: "all 0.2s"
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f5f0e8", fontFamily: "'Georgia', serif", backgroundImage: "radial-gradient(ellipse at 20% 50%, #e8dcc8 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, #d4c5a9 0%, transparent 50%)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Source+Serif+4:ital,wght@0,300;0,400;0,600;1,300&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .account-card:hover { background: #ede5d0 !important; }
        .check-btn:hover:not(:disabled) { background: #1a1a2e !important; color: #f5f0e8 !important; }
        .remove-btn:hover { color: #c0392b !important; }
        .add-btn:hover { background: #1a1a2e !important; color: #f5f0e8 !important; }
        .wp-btn:hover:not(:disabled) { background: #0073aa !important; color: #fff !important; border-color: #0073aa !important; }
        .panel-btn:hover { background: rgba(255,255,255,0.12) !important; }
        input:focus { border-color: #1a1a2e !important; box-shadow: 0 0 0 2px rgba(26,26,46,0.1); }
        .author-row:hover { background: #e8dcc8 !important; }
      `}</style>

      {/* Header */}
      <header style={{ padding: "1.2rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1a1a2e", borderBottom: "2px solid #c8a84b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ color: "#f5c842" }}><Icons.Newsletter /></div>
          <div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.5rem", fontWeight: 900, color: "#f5f0e8", letterSpacing: "-0.02em" }}>The Wire</h1>
            <p style={{ fontSize: "0.72rem", color: "#a0946e", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "'Source Serif 4', serif" }}>Tweet-to-Article Intelligence</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="panel-btn" onClick={() => setActivePanel(activePanel === "authors" ? null : "authors")} style={panelBtnStyle("authors")}>
            <Icons.User /> Topic Authors
            {topicAuthors.length > 0 && <span style={{ background: "#f5c842", color: "#1a1a2e", borderRadius: "10px", padding: "1px 6px", fontSize: "0.65rem", fontWeight: 700 }}>{topicAuthors.length}</span>}
          </button>
          <button className="panel-btn" onClick={() => { setActivePanel(activePanel === "wp" ? null : "wp"); setWpTestResult(null); }} style={panelBtnStyle("wp")}>
            <Icons.Settings /> WordPress
            <span style={{ color: wpConfigured ? "#4caf50" : "#f5c842", fontSize: "0.7rem" }}>{wpConfigured ? "●" : "○"}</span>
          </button>
        </div>
      </header>

      {/* Topic Authors Panel */}
      {activePanel === "authors" && (
        <div style={{ background: "#1e2a3a", borderBottom: "2px solid #c8a84b", padding: "1.5rem 2rem", animation: "slideDown 0.2s ease" }}>
          <div style={{ maxWidth: "700px" }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", fontWeight: 700, color: "#f5f0e8", marginBottom: "0.5rem" }}>Topic Author Rules</p>
            <p style={{ fontSize: "0.75rem", color: "#6a7a8e", fontFamily: "'Source Serif 4', serif", marginBottom: "1rem" }}>
              When an article topic contains the keyword, it will be assigned to that author in WordPress. Keywords are case-insensitive.
            </p>

            {/* Existing rules */}
            {topicAuthors.length > 0 && (
              <div style={{ marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "6px" }}>
                {topicAuthors.map(ta => (
                  <div key={ta.id} className="author-row" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "#2a3547", borderRadius: "5px", border: "1px solid #3a4a5e", transition: "background 0.15s" }}>
                    <Icons.Tag />
                    <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: "0.82rem", color: "#f5c842", minWidth: "120px" }}>{ta.keyword}</span>
                    <span style={{ fontSize: "0.72rem", color: "#6a7a8e", marginRight: "auto" }}>→</span>
                    <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: "0.82rem", color: "#f5f0e8" }}>{ta.author}</span>
                    <button onClick={() => removeTopicAuthor(ta.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6a7a8e", padding: "2px", marginLeft: "4px" }}
                      onMouseOver={e => e.currentTarget.style.color = "#e57373"} onMouseOut={e => e.currentTarget.style.color = "#6a7a8e"}>
                      <Icons.Trash />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new rule */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px", alignItems: "end" }}>
              <div>
                <label style={darkLabelStyle}>Topic Keyword</label>
                <input value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="e.g. Disney Parks" onKeyDown={e => e.key === "Enter" && addTopicAuthor()} style={darkInputStyle} />
              </div>
              <div>
                <label style={darkLabelStyle}>Author Name (as in WordPress)</label>
                <input value={newAuthor} onChange={e => setNewAuthor(e.target.value)} placeholder="e.g. Matthew Smith" onKeyDown={e => e.key === "Enter" && addTopicAuthor()} style={darkInputStyle} />
              </div>
              <button onClick={addTopicAuthor} disabled={!newKeyword.trim() || !newAuthor.trim()}
                style={{ padding: "8px 16px", background: "#f5c842", border: "1.5px solid #c8a84b", borderRadius: "4px", cursor: "pointer", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "0.8rem", color: "#1a1a2e", opacity: (!newKeyword.trim() || !newAuthor.trim()) ? 0.5 : 1 }}>
                Add Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WordPress Settings Panel */}
      {activePanel === "wp" && (
        <div style={{ background: "#1e2a3a", borderBottom: "2px solid #c8a84b", padding: "1.5rem 2rem", animation: "slideDown 0.2s ease" }}>
          <div style={{ maxWidth: "680px" }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", fontWeight: 700, color: "#f5f0e8", marginBottom: "0.5rem" }}>WordPress Connection</p>
            <p style={{ fontSize: "0.75rem", color: "#6a7a8e", fontFamily: "'Source Serif 4', serif", marginBottom: "1rem" }}>
              Generate an Application Password in WP Admin under Users → Profile → Application Passwords.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={darkLabelStyle}>Site URL</label>
                <input value={wpSiteUrl} onChange={e => setWpSiteUrl(e.target.value)} placeholder="https://yoursite.com" style={darkInputStyle} />
              </div>
              <div>
                <label style={darkLabelStyle}>Username</label>
                <input value={wpUsername} onChange={e => setWpUsername(e.target.value)} placeholder="your_username" style={darkInputStyle} />
              </div>
              <div>
                <label style={darkLabelStyle}>Application Password</label>
                <input value={wpAppPassword} onChange={e => setWpAppPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" type="password" style={darkInputStyle} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={saveWpSettings} style={{ padding: "7px 16px", background: "#f5c842", border: "1.5px solid #c8a84b", borderRadius: "4px", cursor: "pointer", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "0.8rem", color: "#1a1a2e" }}>Save Settings</button>
              <button onClick={testWpConnection} disabled={testingWp || !wpSiteUrl || !wpUsername || !wpAppPassword}
                style={{ padding: "7px 16px", background: "transparent", border: "1.5px solid #4a8fbe", borderRadius: "4px", cursor: "pointer", fontFamily: "'Source Serif 4', serif", fontSize: "0.8rem", color: "#4a8fbe", opacity: (testingWp || !wpSiteUrl || !wpUsername || !wpAppPassword) ? 0.5 : 1 }}>
                {testingWp ? "Testing..." : "Test Connection"}
              </button>
              {wpTestResult && (
                <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.78rem", fontFamily: "'Source Serif 4', serif", color: wpTestResult.success ? "#4caf50" : "#e57373" }}>
                  {wpTestResult.success ? <Icons.Check /> : <Icons.Xmark />}
                  {wpTestResult.message}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", minHeight: "calc(100vh - 74px)" }}>
        {/* Sidebar */}
        <aside style={{ borderRight: "1.5px solid #c8b99a", padding: "1.5rem", background: "#ede8dc" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b5a3e" }}>Tracked Accounts</span>
            <button className="add-btn" onClick={() => setShowAddForm(!showAddForm)}
              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "5px 10px", border: "1.5px solid #1a1a2e", borderRadius: "4px", cursor: "pointer", fontSize: "0.75rem", background: "transparent", color: "#1a1a2e", fontFamily: "'Source Serif 4', serif", transition: "all 0.2s" }}>
              <Icons.Plus /> Add
            </button>
          </div>

          {showAddForm && (
            <div style={{ marginBottom: "1.2rem", padding: "1rem", background: "#f5f0e8", borderRadius: "6px", border: "1px solid #c8b99a", animation: "fadeIn 0.2s ease" }}>
              <label style={labelStyle}>Twitter/X Handle</label>
              <input value={newHandle} onChange={e => setNewHandle(e.target.value)} placeholder="@handle" onKeyDown={e => e.key === "Enter" && addAccount()} style={inputStyle} />
              <label style={labelStyle}>Topic Focus</label>
              <input value={newTopic} onChange={e => setNewTopic(e.target.value)} placeholder="e.g. Disney Parks news" onKeyDown={e => e.key === "Enter" && addAccount()} style={inputStyle} />
              {newTopic && resolveAuthor(newTopic, topicAuthors) && (
                <p style={{ fontSize: "0.72rem", color: "#2e7d32", fontFamily: "'Source Serif 4', serif", marginBottom: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Icons.Check /> Will be assigned to <strong>{resolveAuthor(newTopic, topicAuthors)}</strong>
                </p>
              )}
              <button onClick={addAccount} style={{ width: "100%", padding: "7px", background: "#f5c842", border: "1.5px solid #1a1a2e", borderRadius: "4px", cursor: "pointer", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "0.8rem", color: "#1a1a2e" }}>Add Account</button>
              {error && <p style={{ color: "#c0392b", fontSize: "0.75rem", marginTop: "6px" }}>{error}</p>}
            </div>
          )}

          {accounts.length === 0 && (
            <div style={{ textAlign: "center", padding: "2rem 1rem", color: "#a0946e" }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: "0.9rem" }}>No accounts yet.</p>
              <p style={{ fontSize: "0.75rem", marginTop: "0.5rem", fontFamily: "'Source Serif 4', serif" }}>Add a handle to start tracking.</p>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {accounts.map(account => {
              const author = resolveAuthor(account.topic, topicAuthors);
              return (
                <div key={account.id} className="account-card"
                  style={{ padding: "0.9rem 1rem", background: activeArticle?.id === account.id ? "#e8dcc8" : "#f0ead8", borderRadius: "6px", border: activeArticle?.id === account.id ? "1.5px solid #c8a84b" : "1.5px solid #c8b99a", transition: "all 0.15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "0.9rem", color: "#1a1a2e" }}>@{account.handle}</p>
                      <p style={{ fontSize: "0.72rem", color: "#8a7a5a", fontFamily: "'Source Serif 4', serif", marginTop: "2px" }}>{account.topic}</p>
                      {author && (
                        <p style={{ fontSize: "0.68rem", color: "#5a8a6a", fontFamily: "'Source Serif 4', serif", marginTop: "2px", display: "flex", alignItems: "center", gap: "3px" }}>
                          <Icons.User /> {author}
                        </p>
                      )}
                      <p style={{ fontSize: "0.68rem", color: "#a0946e", marginTop: "3px", fontFamily: "'Source Serif 4', serif" }}>Checked: {timeAgo(account.lastChecked)}</p>
                    </div>
                    <button className="remove-btn" onClick={() => removeAccount(account.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c8b99a", padding: "2px", transition: "color 0.15s" }}><Icons.Trash /></button>
                  </div>
                  <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
                    <button className="check-btn" onClick={() => fetchAndGenerate(account)} disabled={loadingId === account.id}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", padding: "6px 10px", border: "1.5px solid #1a1a2e", borderRadius: "4px", cursor: loadingId === account.id ? "wait" : "pointer", background: "transparent", color: "#1a1a2e", fontFamily: "'Source Serif 4', serif", fontSize: "0.75rem", transition: "all 0.2s", opacity: loadingId === account.id ? 0.6 : 1 }}>
                      <Icons.Refresh spinning={loadingId === account.id} />
                      {loadingId === account.id ? "Generating..." : "Check Now"}
                    </button>
                    {account.lastArticle && (
                      <button onClick={() => { setPublishStatus(null); setActiveArticle({ id: account.id, handle: account.handle, topic: account.topic, assignedAuthor: resolveAuthor(account.topic, topicAuthors), article: account.lastArticle, tweets: account.tweets, yoast: account.yoast }); }}
                        style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 10px", border: "1.5px solid #c8a84b", borderRadius: "4px", cursor: "pointer", background: "#f5c842", color: "#1a1a2e", fontFamily: "'Source Serif 4', serif", fontSize: "0.75rem" }}>
                        <Icons.Article /> View
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main content */}
        <main style={{ padding: "2.5rem 3rem", maxWidth: "780px", overflowY: "auto" }}>
          {!activeArticle ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📰</div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.8rem", fontWeight: 900, color: "#1a1a2e", marginBottom: "0.75rem" }}>Your newsroom awaits.</h2>
              <p style={{ fontFamily: "'Source Serif 4', serif", color: "#8a7a5a", fontSize: "0.95rem", maxWidth: "420px", lineHeight: 1.7 }}>
                Add a Twitter/X account, set a topic focus, and hit <strong>Check Now</strong> to generate a full editorial article with Yoast SEO fields -- then publish directly to WordPress.
              </p>
              <div style={{ display: "flex", gap: "10px", marginTop: "1.5rem" }}>
                {!topicAuthors.length && (
                  <button onClick={() => setActivePanel("authors")}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", border: "1.5px solid #6b5a3e", borderRadius: "4px", cursor: "pointer", background: "transparent", color: "#6b5a3e", fontFamily: "'Source Serif 4', serif", fontSize: "0.82rem" }}>
                    <Icons.User /> Set Up Authors
                  </button>
                )}
                {!wpConfigured && (
                  <button onClick={() => setActivePanel("wp")}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", border: "1.5px solid #0073aa", borderRadius: "4px", cursor: "pointer", background: "transparent", color: "#0073aa", fontFamily: "'Source Serif 4', serif", fontSize: "0.82rem" }}>
                    <Icons.Settings /> Connect WordPress
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              {/* Author + topic badge */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "1.5rem", flexWrap: "wrap" }}>
                {activeArticle.assignedAuthor && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", background: "#e8f5e9", border: "1px solid #a8dba8", borderRadius: "20px", fontSize: "0.72rem", color: "#2e7d32", fontFamily: "'Source Serif 4', serif" }}>
                    <Icons.User /> {activeArticle.assignedAuthor}
                  </span>
                )}
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", background: "#fff8e1", border: "1px solid #f5c842", borderRadius: "20px", fontSize: "0.72rem", color: "#8a6a00", fontFamily: "'Source Serif 4', serif" }}>
                  <Icons.Tag /> {activeArticle.topic}
                </span>
              </div>

              {/* Source tweets */}
              {activeArticle.tweets?.length > 0 && (
                <div style={{ marginBottom: "2rem", padding: "1rem 1.25rem", background: "#ede8dc", borderRadius: "6px", borderLeft: "3px solid #c8a84b" }}>
                  <p style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "#8a7a5a", fontFamily: "'Source Serif 4', serif", marginBottom: "0.75rem", fontWeight: 600 }}>Source tweets from @{activeArticle.handle}</p>
                  {activeArticle.tweets.map((t, i) => (
                    <div key={i} style={{ marginBottom: "0.6rem", padding: "0.6rem 0.75rem", background: "#f5f0e8", borderRadius: "4px", border: "1px solid #d4c5a9" }}>
                      <p style={{ fontSize: "0.82rem", color: "#2d2d2d", fontFamily: "'Source Serif 4', serif", lineHeight: 1.5 }}>{t.text}</p>
                      <p style={{ fontSize: "0.68rem", color: "#a0946e", marginTop: "4px", fontFamily: "'Source Serif 4', serif" }}>{t.date}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Yoast SEO fields */}
              {activeArticle.yoast && (
                <div style={{ marginBottom: "2rem", padding: "1rem 1.25rem", background: "#f0f7ff", borderRadius: "6px", border: "1.5px solid #b0d4f1", borderLeft: "3px solid #0073aa" }}>
                  <p style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "#0073aa", fontFamily: "'Source Serif 4', serif", marginBottom: "0.85rem", fontWeight: 600 }}>Yoast SEO Fields</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    {[
                      { label: "Focus Keyphrase", value: activeArticle.yoast.focusKeyphrase },
                      { label: "SEO Title", value: activeArticle.yoast.seoTitle, note: `${(activeArticle.yoast.seoTitle || "").length}/60` },
                      { label: "Slug", value: activeArticle.yoast.slug },
                      { label: "Meta Description", value: activeArticle.yoast.metaDescription, note: `${(activeArticle.yoast.metaDescription || "").length}/155`, full: true },
                    ].map(field => (
                      <div key={field.label} style={{ gridColumn: field.full ? "1 / -1" : undefined }}>
                        <p style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#4a8fbe", fontFamily: "'Source Serif 4', serif", marginBottom: "3px", fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                          {field.label}
                          {field.note && <span style={{ color: parseInt(field.note) > parseInt(field.note.split("/")[1]) ? "#c0392b" : "#4caf50" }}>{field.note}</span>}
                        </p>
                        <p style={{ fontSize: "0.82rem", color: "#1a2a3a", fontFamily: "'Source Serif 4', serif", background: "#fff", padding: "6px 8px", borderRadius: "3px", border: "1px solid #b0d4f1" }}>{field.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Article */}
              <div style={{ borderTop: "3px solid #1a1a2e", paddingTop: "2rem" }}>
                <p style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.2em", color: "#c8a84b", fontFamily: "'Source Serif 4', serif", marginBottom: "0.75rem", fontWeight: 600 }}>Generated Article</p>
                <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "2.2rem", fontWeight: 900, lineHeight: 1.2, color: "#1a1a2e", marginBottom: "0.75rem" }}>{activeArticle.article.headline}</h1>
                <p style={{ fontFamily: "'Source Serif 4', serif", fontSize: "1.05rem", fontStyle: "italic", color: "#6b5a3e", marginBottom: "1.5rem", lineHeight: 1.5 }}>{activeArticle.article.subheadline}</p>
                <hr style={{ border: "none", borderTop: "1px solid #c8b99a", marginBottom: "1.5rem" }} />
                <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: "0.95rem" }}>{renderArticleBody(activeArticle.article.body)}</div>
              </div>

              {/* Action buttons */}
              <div style={{ marginTop: "2rem", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={() => navigator.clipboard.writeText(activeArticle.article.headline + "\n\n" + activeArticle.article.subheadline + "\n\n" + activeArticle.article.body)}
                  style={{ padding: "8px 16px", border: "1.5px solid #1a1a2e", borderRadius: "4px", cursor: "pointer", background: "#f5c842", color: "#1a1a2e", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "0.8rem" }}>
                  Copy Article
                </button>
                <button className="wp-btn" onClick={publishToWordPress} disabled={publishingId === activeArticle.id}
                  style={{ padding: "8px 16px", border: `1.5px solid ${wpConfigured ? "#0073aa" : "#bbb"}`, borderRadius: "4px", cursor: publishingId === activeArticle.id ? "wait" : "pointer", background: "transparent", color: wpConfigured ? "#0073aa" : "#999", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "6px", opacity: publishingId === activeArticle.id ? 0.6 : 1, transition: "all 0.2s" }}>
                  <Icons.WordPress />
                  {publishingId === activeArticle.id ? "Publishing..." : "Publish Draft to WordPress"}
                </button>
                {!wpConfigured && <span style={{ fontSize: "0.72rem", color: "#a0946e", fontFamily: "'Source Serif 4', serif" }}>Configure WordPress in Settings first</span>}
              </div>

              {publishStatus && (
                <div style={{ marginTop: "1rem", padding: "0.85rem 1rem", background: publishStatus.type === "success" ? "#f0faf0" : "#fdf0ee", border: `1px solid ${publishStatus.type === "success" ? "#a8dba8" : "#e8a99a"}`, borderRadius: "4px", display: "flex", alignItems: "flex-start", gap: "8px", animation: "fadeIn 0.2s ease" }}>
                  <span style={{ color: publishStatus.type === "success" ? "#2e7d32" : "#c0392b", marginTop: "1px" }}>
                    {publishStatus.type === "success" ? <Icons.Check /> : <Icons.Xmark />}
                  </span>
                  <div>
                    <p style={{ fontSize: "0.82rem", fontFamily: "'Source Serif 4', serif", color: publishStatus.type === "success" ? "#2e7d32" : "#c0392b", fontWeight: 600 }}>{publishStatus.message}</p>
                    {publishStatus.url && (
                      <a href={publishStatus.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "#0073aa", fontFamily: "'Source Serif 4', serif", textDecoration: "underline" }}>
                        Open in WordPress Editor →
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", background: "#fdf0ee", border: "1px solid #e8a99a", borderRadius: "4px" }}>
              <p style={{ color: "#c0392b", fontSize: "0.82rem", fontFamily: "'Source Serif 4', serif" }}>{error}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

    
