import { useState, useEffect } from "react";

const STORAGE_KEY = "tweet_article_tracker";
const WP_SETTINGS_KEY = "wp_settings";
const WPCOM_SETTINGS_KEY = "wpcom_settings";
const AUTHORS_KEY = "topic_authors";

// WordPress.com OAuth config -- replace CLIENT_ID with your actual Client ID from developer.wordpress.com
const WPCOM_CLIENT_ID = "139851";
const WPCOM_BLOG_ID = "216018568";
const WPCOM_REDIRECT_URI = typeof window !== "undefined" ? window.location.origin : "";

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

function bodyToHtml(body, tweet, handle) {
  const strip = (t) => t.replace(/<\/?cite[^>]*>/gi, "").replace(/<[^>]+>/g, "").replace(/[ \t]+/g, " ").trim();
  let embed = "";
  if (tweet && handle && tweet.tweetId && !tweet.tweetId.startsWith("manual-")) {
    const tweetUrl = tweet.link || `https://twitter.com/${handle}/status/${tweet.tweetId}`;
    embed = `<!-- wp:embed {"url":"${tweetUrl}","type":"rich","providerNameSlug":"twitter","responsive":true} -->\n<figure class="wp-block-embed is-type-rich is-provider-twitter wp-block-embed-twitter"><div class="wp-block-embed__wrapper">${tweetUrl}</div></figure>\n<!-- /wp:embed -->\n`;
  } else if (tweet) {
    // Manual tweet or no ID - show as a styled blockquote
    embed = `<blockquote class="wp-block-quote"><p>${strip(tweet.text)}</p><cite>@${handle || "Twitter"}</cite></blockquote>\n`;
  }
  const articleBody = body.split("\n\n").map(block => {
    if (block.startsWith("## ")) return `<h2>${strip(block.replace("## ", ""))}</h2>`;
    return `<p>${strip(block)}</p>`;
  }).join("\n");
  return embed + articleBody;
}

function resolveAuthor(topic, topicAuthors) {
  if (!topic || !topicAuthors.length) return null;
  const lower = topic.toLowerCase();
  const match = topicAuthors.find(ta => lower.includes(ta.keyword.toLowerCase()));
  return match ? match.author : null;
}

const Icons = {
  Newsletter: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/><path d="M4 4l8 8 8-8"/></svg>,
  Plus: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>,
  Trash: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>,
  Refresh: ({ spinning }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: spinning ? "spin 1s linear infinite" : "none" }}><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>,
  Article: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>,
  Settings: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  User: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  WordPress: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm-1.5 14.5l-3-8.5h1.5l1.5 4.5 1.5-4.5H13l1.5 4.5 1.5-4.5H17.5l-3 8.5-1.5-4-1.5 4z"/></svg>,
  Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>,
  Xmark: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  Back: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>,
  Tag: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  Copy: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  Queue: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>,
  CheckBox: ({ checked }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3" fill={checked ? "currentColor" : "none"}/>{checked && <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2.5"/>}</svg>
};

const inputStyle = { width: "100%", padding: "10px 12px", marginBottom: "12px", border: "1.5px solid #7eb5d0", borderRadius: "6px", fontFamily: "'Lora', serif", fontSize: "16px", background: "#fff", outline: "none", color: "#0a2540" };
const labelStyle = { display: "block", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#0a2540", fontFamily: "'Lora', serif", marginBottom: "5px", fontWeight: 700 };

const NAV_TABS = [
  { id: "accounts", label: "Accounts", icon: "Newsletter" },
  { id: "quick", label: "Quick", icon: "Plus" },
  { id: "queue", label: "Queue", icon: "Queue" },
  { id: "authors", label: "Authors", icon: "User" },
  { id: "wordpress", label: "WP", icon: "Settings" },
];

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [newHandle, setNewHandle] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newRssUrl, setNewRssUrl] = useState("");
  const [manualTweetText, setManualTweetText] = useState("");
  const [quickTweetText, setQuickTweetText] = useState("");
  const [quickTopic, setQuickTopic] = useState("");
  const [quickHandle, setQuickHandle] = useState("");
  const [generatingQuick, setGeneratingQuick] = useState(false);
  const [showManualInput, setShowManualInput] = useState(null); // account.id
  const [editPrompt, setEditPrompt] = useState("");
  const [editingArticle, setEditingArticle] = useState(false);
  const [activeTab, setActiveTab] = useState("accounts");
  const [activeArticle, setActiveArticle] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [generatingProgress, setGeneratingProgress] = useState({ current: 0, total: 0 });
  const [publishingId, setPublishingId] = useState(null);
  const [publishStatus, setPublishStatus] = useState(null);
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [copied, setCopied] = useState(false);

  // Tweet selection state
  const [tweetSelection, setTweetSelection] = useState(null); // { account, tweets, selectedIds }
  const [fetchingTweetsFor, setFetchingTweetsFor] = useState(null);

  // WP settings (Basic Auth, for non-GoDaddy)
  const [wpSiteUrl, setWpSiteUrl] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");
  const [wpSaved, setWpSaved] = useState(false);
  const [testingWp, setTestingWp] = useState(false);
  const [wpTestResult, setWpTestResult] = useState(null);
  const [wpAuthorIds, setWpAuthorIds] = useState({});

  // WordPress.com OAuth state (for GoDaddy/Jetpack workaround)
  const [wpcomToken, setWpcomToken] = useState("");
  const [wpcomBlogId, setWpcomBlogId] = useState("");
  const [wpcomUser, setWpcomUser] = useState("");
  const [publishMethod, setPublishMethod] = useState("basic"); // 'basic' or 'wpcom'

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
    const wpcom = localStorage.getItem(WPCOM_SETTINGS_KEY);
    if (wpcom) {
      try {
        const { token, blogId, user, method } = JSON.parse(wpcom);
        setWpcomToken(token || ""); setWpcomBlogId(blogId || ""); setWpcomUser(user || "");
        if (method) setPublishMethod(method);
      } catch {}
    }
    const ta = localStorage.getItem(AUTHORS_KEY);
    if (ta) { try { setTopicAuthors(JSON.parse(ta)); } catch {} }

    // Check for OAuth callback in URL hash
    if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const token = params.get("access_token");
      let blogId = params.get("blog_id") || params.get("site_id");
      // Fallback to hardcoded site ID if missing or zero
      if (!blogId || blogId === "0") blogId = WPCOM_BLOG_ID;
      if (token && blogId) {
        const newSettings = { token, blogId, user: "", method: "wpcom" };
        setWpcomToken(token); setWpcomBlogId(blogId); setPublishMethod("wpcom");
        localStorage.setItem(WPCOM_SETTINGS_KEY, JSON.stringify(newSettings));
        // Get user info
        fetch(`https://public-api.wordpress.com/rest/v1.1/me`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json()).then(d => {
            if (d.username) {
              setWpcomUser(d.username);
              localStorage.setItem(WPCOM_SETTINGS_KEY, JSON.stringify({ ...newSettings, user: d.username }));
            }
          }).catch(() => {});
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  const saveAccounts = (accs) => { setAccounts(accs); localStorage.setItem(STORAGE_KEY, JSON.stringify(accs)); };
  const saveTopicAuthors = (ta) => { setTopicAuthors(ta); localStorage.setItem(AUTHORS_KEY, JSON.stringify(ta)); };

  const saveWpSettings = () => {
    localStorage.setItem(WP_SETTINGS_KEY, JSON.stringify({ siteUrl: wpSiteUrl.replace(/\/$/, ""), username: wpUsername, appPassword: wpAppPassword }));
    setWpSaved(true); setWpTestResult(null);
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
      } else { setWpTestResult({ success: false, message: `Auth failed (${res.status}).` }); }
    } catch { setWpTestResult({ success: false, message: "Could not reach your site." }); }
    finally { setTestingWp(false); }
  };

  const connectWordPressCom = () => {
    const authUrl = `https://public-api.wordpress.com/oauth2/authorize?client_id=${WPCOM_CLIENT_ID}&redirect_uri=${encodeURIComponent(WPCOM_REDIRECT_URI)}&response_type=token&scope=global`;
    window.location.href = authUrl;
  };

  const disconnectWordPressCom = () => {
    setWpcomToken(""); setWpcomBlogId(""); setWpcomUser("");
    localStorage.removeItem(WPCOM_SETTINGS_KEY);
    setPublishMethod("basic");
  };

  const addAccount = () => {
    const handle = newHandle.replace(/^@/, "").trim();
    if (!handle) return;
    if (accounts.find(a => a.handle.toLowerCase() === handle.toLowerCase())) { setError("Account already added."); return; }
    saveAccounts([...accounts, { id: Date.now(), handle, topic: newTopic.trim() || "general news", rssUrl: newRssUrl.trim(), lastChecked: null, usedTweetIds: [], queue: [] }]);
    setNewHandle(""); setNewTopic(""); setNewRssUrl(""); setShowAddForm(false); setError("");
  };

  const removeAccount = (id) => {
    saveAccounts(accounts.filter(a => a.id !== id));
    if (activeArticle?.accountId === id) setActiveArticle(null);
  };

  const clearTweetHistory = (accountId) => {
    const updated = accounts.map(a => a.id === accountId ? { ...a, usedTweetIds: [] } : a);
    saveAccounts(updated);
  };

    const addTopicAuthor = () => {
    const kw = newKeyword.trim(); const au = newAuthor.trim();
    if (!kw || !au) return;
    saveTopicAuthors([...topicAuthors, { id: Date.now(), keyword: kw, author: au }]);
    setNewKeyword(""); setNewAuthor("");
  };

  // STEP 1: Fetch tweets only (no article generation yet)
  const fetchTweetsForSelection = async (account, includeUsed = false) => {
    if (!account.rssUrl) {
      setError("This account has no RSS feed URL. Edit the account to add one or use Manual Paste.");
      return;
    }
    setFetchingTweetsFor(account.id); setError("");
    const usedTweetIds = account.usedTweetIds || [];

    try {
      // Fetch RSS feed via a CORS proxy
      const proxyUrl = `/api/rss?url=${encodeURIComponent(account.rssUrl)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`RSS fetch failed (${res.status})`);
      const rssText = await res.text();

      // Parse RSS/XML
      const parser = new DOMParser();
      const doc = parser.parseFromString(rssText, "text/xml");
      const items = Array.from(doc.querySelectorAll("item, entry"));

      if (items.length === 0) throw new Error("No tweets found in RSS feed");

      const allTweets = items.slice(0, 40).map((item, idx) => {
        const title = item.querySelector("title")?.textContent || "";
        const description = item.querySelector("description, content, summary")?.textContent || "";
        const link = item.querySelector("link")?.textContent || item.querySelector("link")?.getAttribute("href") || "";
        const pubDate = item.querySelector("pubDate, published, updated")?.textContent || "";
        const guid = item.querySelector("guid, id")?.textContent || link || `${account.id}-${idx}`;

        // Extract tweet ID from URL if present
        const idMatch = link.match(/status\/(\d+)/);
        const tweetId = idMatch ? idMatch[1] : guid.replace(/[^0-9]/g, "").substring(0, 19) || `${Date.now()}${idx}`;

        // Strip HTML from description and use as tweet text
        const tmp = document.createElement("div");
        tmp.innerHTML = description || title;
        const text = (tmp.textContent || tmp.innerText || title).trim().substring(0, 500);

        const date = pubDate ? new Date(pubDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Recent";

        return { text, date, tweetId, link };
      });

      const filtered = includeUsed
        ? allTweets.map(t => ({ ...t, alreadyUsed: usedTweetIds.includes(t.tweetId) }))
        : allTweets.filter(t => !usedTweetIds.includes(t.tweetId));

      if (filtered.length === 0) { setError(includeUsed ? "No tweets found in feed." : "No new tweets found since last check."); setFetchingTweetsFor(null); return; }
      setTweetSelection({ account, tweets: filtered, selectedIds: new Set(), includeUsed });
    } catch (e) {
      setError(`Failed to fetch RSS: ${e.message}`);
    } finally {
      setFetchingTweetsFor(null);
    }
  };

  // Manual tweet entry -- creates a single tweet from pasted text
  const submitManualTweet = async (account) => {
    if (!manualTweetText.trim()) return;
    const manualTweet = {
      text: manualTweetText.trim(),
      date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      tweetId: `manual-${Date.now()}`,
      link: ""
    };
    setTweetSelection({ account, tweets: [manualTweet], selectedIds: new Set([manualTweet.tweetId]) });
    setManualTweetText("");
    setShowManualInput(null);
  };

  // STEP 2: Generate articles only for selected tweets
  const generateSelectedArticles = async () => {
    if (!tweetSelection || tweetSelection.selectedIds.size === 0) return;
    const account = tweetSelection.account;
    const selectedTweets = tweetSelection.tweets.filter(t => tweetSelection.selectedIds.has(t.tweetId));
    const assignedAuthor = resolveAuthor(account.topic, topicAuthors);

    setLoadingId(account.id); setError("");
    setGeneratingProgress({ current: 0, total: selectedTweets.length });

    try {
      const newArticles = [];
      const newUsedIds = [...(account.usedTweetIds || [])];

      for (let i = 0; i < selectedTweets.length; i++) {
        setGeneratingProgress({ current: i + 1, total: selectedTweets.length });
        const tweet = selectedTweets[i];
        try {
          const prompt = `Write a complete editorial article based on this tweet from @${account.handle} about "${account.topic}":\n\nTweet: "${tweet.text}"\nDate: ${tweet.date}\n\nFirst, use web search to verify the facts and find current, accurate information related to this tweet. Then write the article using verified information. Include background, analysis, and what it means for fans. Plus generate Yoast SEO fields. CRITICAL: Do NOT include any HTML tags, citation markers like cite tags, or reference indices in the article body. The body must be clean prose only with no XML or HTML.\n\nReturn ONLY JSON, no markdown:\n{"article":{"headline":"","subheadline":"","body":"4+ paragraphs with ## subheadings, \\n\\n between paragraphs"},"yoast":{"focusKeyphrase":"2-4 words","seoTitle":"under 60 chars","metaDescription":"under 155 chars with CTA","slug":"url-friendly-slug"}}`;
          const r = await fetch("/api/anthropic", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 4000, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }], messages: [{ role: "user", content: prompt }] })
          });
          const d = await r.json();
          if (d.error) throw new Error(d.error.message);
          // Find the final text block (after any tool use)
          const textBlocks = d.content?.filter(b => b.type === "text") || [];
          const raw = textBlocks.map(b => b.text).join("\n");
          const m = raw.match(/\{[\s\S]*\}/);
          if (!m) continue;
          const parsed = JSON.parse(m[0]);
          if (parsed.article?.body) {
            parsed.article.body = parsed.article.body.replace(/<\/?cite[^>]*>/gi, "").replace(/[ \t]+/g, " ").replace(/ ([.,!?])/g, "$1").trim();
          }
          newArticles.push({ tweet, article: parsed.article, yoast: parsed.yoast, assignedAuthor, accountId: account.id, handle: account.handle, topic: account.topic, id: `${account.id}-${tweet.tweetId}` });
          newUsedIds.push(tweet.tweetId);
        } catch (e) { console.error(`Failed for tweet ${i}:`, e); }
      }

      const updated = accounts.map(a => a.id === account.id ? { ...a, lastChecked: new Date().toISOString(), usedTweetIds: newUsedIds, queue: [...(a.queue || []), ...newArticles] } : a);
      saveAccounts(updated);
      setTweetSelection(null);
      setActiveTab("queue");
    } catch (e) { setError(`Failed: ${e.message}`); }
    finally { setLoadingId(null); setGeneratingProgress({ current: 0, total: 0 }); }
  };

  const toggleTweetSelection = (tweetId) => {
    if (!tweetSelection) return;
    const newSet = new Set(tweetSelection.selectedIds);
    if (newSet.has(tweetId)) newSet.delete(tweetId);
    else newSet.add(tweetId);
    setTweetSelection({ ...tweetSelection, selectedIds: newSet });
  };

  const selectAllTweets = () => {
    if (!tweetSelection) return;
    if (tweetSelection.selectedIds.size === tweetSelection.tweets.length) {
      setTweetSelection({ ...tweetSelection, selectedIds: new Set() });
    } else {
      setTweetSelection({ ...tweetSelection, selectedIds: new Set(tweetSelection.tweets.map(t => t.tweetId)) });
    }
  };

  const allQueued = accounts.flatMap(a => (a.queue || []).map(item => ({ ...item, accountHandle: a.handle })));

  const resolveWpAuthorId = async (authorName, base, creds) => {
    if (wpAuthorIds[authorName]) return wpAuthorIds[authorName];
    try {
      const res = await fetch(`${base}/wp-json/wp/v2/users?search=${encodeURIComponent(authorName)}&per_page=5`, { headers: { Authorization: `Basic ${creds}` } });
      if (res.ok) {
        const users = await res.json();
        const match = users.find(u => u.name.toLowerCase() === authorName.toLowerCase() || u.slug.toLowerCase() === authorName.toLowerCase());
        if (match) { setWpAuthorIds(prev => ({ ...prev, [authorName]: match.id })); return match.id; }
      }
    } catch {}
    return null;
  };

  // Publishes via WordPress.com API (bypasses GoDaddy restrictions)
  const publishToWordPressCom = async (articleData) => {
    setPublishingId(articleData.id); setPublishStatus(null);
    try {
      const yoast = articleData.yoast || {};
      const body = {
        title: articleData.article.headline,
        content: bodyToHtml(articleData.article.body, articleData.tweet, articleData.handle),
        excerpt: articleData.article.subheadline,
        slug: yoast.slug || "",
        status: "draft",
        metadata: [
          { key: "_yoast_wpseo_focuskw", value: yoast.focusKeyphrase || "", operation: "update" },
          { key: "_yoast_wpseo_title", value: yoast.seoTitle || "", operation: "update" },
          { key: "_yoast_wpseo_metadesc", value: yoast.metaDescription || "", operation: "update" },
        ]
      };
      const res = await fetch(`https://public-api.wordpress.com/rest/v1.1/sites/${wpcomBlogId}/posts/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${wpcomToken}` },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        setPublishStatus({ type: "success", message: `Draft published to WordPress.com!`, url: data.URL || `https://wordpress.com/post/${wpcomBlogId}/${data.ID}` });
        removeFromQueue(articleData.id);
      } else {
        const err = await res.json().catch(() => ({}));
        setPublishStatus({ type: "error", message: err.message || `Failed (${res.status}).` });
      }
    } catch (e) { setPublishStatus({ type: "error", message: "Could not reach WordPress.com." }); }
    finally { setPublishingId(null); }
  };

  // Publishes via direct Basic Auth (for hosts that allow it)
  const publishToWordPressBasic = async (articleData) => {
    const wp = localStorage.getItem(WP_SETTINGS_KEY);
    if (!wp) { setPublishStatus({ type: "error", message: "WordPress not configured." }); return; }
    const { siteUrl, username, appPassword } = JSON.parse(wp);
    setPublishingId(articleData.id); setPublishStatus(null);
    try {
      const base = siteUrl.replace(/\/$/, "");
      const creds = btoa(`${username}:${appPassword}`);
      const yoast = articleData.yoast || {};
      const postBody = {
        title: articleData.article.headline,
        content: bodyToHtml(articleData.article.body, articleData.tweet, articleData.handle),
        excerpt: articleData.article.subheadline,
        slug: yoast.slug || "",
        status: "draft",
        meta: {
          _yoast_wpseo_focuskw: yoast.focusKeyphrase || "",
          _yoast_wpseo_title: yoast.seoTitle || "",
          _yoast_wpseo_metadesc: yoast.metaDescription || "",
        }
      };
      if (articleData.assignedAuthor) {
        const authorId = await resolveWpAuthorId(articleData.assignedAuthor, base, creds);
        if (authorId) postBody.author = authorId;
      }
      const res = await fetch(`${base}/wp-json/wp/v2/posts`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Basic ${creds}` },
        body: JSON.stringify(postBody)
      });
      if (res.ok) {
        const data = await res.json();
        setPublishStatus({ type: "success", message: `Draft published!`, url: `${base}/wp-admin/post.php?post=${data.id}&action=edit` });
        removeFromQueue(articleData.id);
      } else {
        const err = await res.json().catch(() => ({}));
        setPublishStatus({ type: "error", message: err.message || `Failed (${res.status}).` });
      }
    } catch { setPublishStatus({ type: "error", message: "Could not reach WordPress." }); }
    finally { setPublishingId(null); }
  };

  // Quick standalone article from pasted tweet (not tied to an account)
  const generateQuickArticle = async () => {
    if (!quickTweetText.trim() || !quickTopic.trim()) {
      setError("Please provide tweet content or URL, and a topic.");
      return;
    }
    setGeneratingQuick(true);
    setError("");
    const assignedAuthor = resolveAuthor(quickTopic, topicAuthors);

    // Detect if input is a tweet URL and try to fetch its text
    let tweetText = quickTweetText.trim();
    let detectedHandle = quickHandle.replace(/^@/, "").trim();
    let tweetLink = "";
    let tweetId = `quick-${Date.now()}`;

    const urlMatch = tweetText.match(/^https?:\/\/(?:twitter\.com|x\.com)\/([^\/]+)\/status\/(\d+)/i);
    if (urlMatch) {
      tweetLink = tweetText;
      const urlHandle = urlMatch[1];
      tweetId = urlMatch[2];
      if (!detectedHandle) detectedHandle = urlHandle;
      try {
        // Use Twitter oEmbed via proxy
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetLink)}&omit_script=true`;
        const proxyUrl = `/api/rss?url=${encodeURIComponent(oembedUrl)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.html) {
            // Strip HTML and extract just the tweet text
            const tmp = document.createElement("div");
            tmp.innerHTML = data.html;
            // Tweet text is usually in the first <p> tag
            const p = tmp.querySelector("p");
            tweetText = p ? (p.textContent || p.innerText).trim() : tmp.textContent.trim();
            // Remove the trailing "— Author Name (@handle) Date" line
            tweetText = tweetText.replace(/\s*[—–-]\s*[^()]+\(@[^)]+\)\s*[\w\s,]+\d{4}\s*$/i, "").trim();
          }
        }
      } catch (e) {
        console.error("Failed to fetch tweet text:", e);
        setError("Could not fetch tweet from URL. You can paste the tweet text directly instead.");
        setGeneratingQuick(false);
        return;
      }
    }

    const tweet = {
      text: tweetText,
      date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      tweetId,
      link: tweetLink
    };
    try {
      const handle = detectedHandle || "Source";
      const prompt = `Write a complete editorial article based on this tweet from @${handle} about "${quickTopic}":\n\nTweet: "${tweet.text}"\nDate: ${tweet.date}\n\nFirst, use web search to verify the facts and find current, accurate information related to this tweet. Then write the article using verified information. Include background, analysis, and what it means for fans. Plus generate Yoast SEO fields. CRITICAL: Do NOT include any HTML tags, citation markers like cite tags, or reference indices in the article body. The body must be clean prose only with no XML or HTML.\n\nReturn ONLY JSON, no markdown:\n{"article":{"headline":"","subheadline":"","body":"4+ paragraphs with ## subheadings, \\n\\n between paragraphs"},"yoast":{"focusKeyphrase":"2-4 words","seoTitle":"under 60 chars","metaDescription":"under 155 chars with CTA","slug":"url-friendly-slug"}}`;

      const r = await fetch("/api/anthropic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 4000, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }], messages: [{ role: "user", content: prompt }] })
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      const textBlocks = d.content?.filter(b => b.type === "text") || [];
      const raw = textBlocks.map(b => b.text).join("\n");
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Could not parse response");
      const parsed = JSON.parse(m[0]);
      if (parsed.article?.body) {
        parsed.article.body = parsed.article.body.replace(/<\/?cite[^>]*>/gi, "").replace(/[ \t]+/g, " ").replace(/ ([.,!?])/g, "$1").trim();
      }

      const articleId = `quick-${Date.now()}`;
      const newArticle = { tweet, article: parsed.article, yoast: parsed.yoast, assignedAuthor, accountId: "quick", handle, topic: quickTopic, id: articleId };

      // Add to a "quick" pseudo-account in the queue
      let quickAccount = accounts.find(a => a.id === "quick");
      if (!quickAccount) {
        quickAccount = { id: "quick", handle: "Quick Articles", topic: "Quick", queue: [newArticle], usedTweetIds: [], lastChecked: null };
        saveAccounts([...accounts, quickAccount]);
      } else {
        const updated = accounts.map(a => a.id === "quick" ? { ...a, queue: [...(a.queue || []), newArticle] } : a);
        saveAccounts(updated);
      }

      // Clear form and show article
      setQuickTweetText(""); setQuickTopic(""); setQuickHandle("");
      setActiveArticle(newArticle);
    } catch (e) {
      setError(`Failed: ${e.message}`);
    } finally {
      setGeneratingQuick(false);
    }
  };

    // Edit article via chat prompt
  const editArticleWithPrompt = async () => {
    if (!activeArticle || !editPrompt.trim()) return;
    setEditingArticle(true);
    try {
      const prompt = `Here is the current article:\n\nHeadline: ${activeArticle.article.headline}\nSubheadline: ${activeArticle.article.subheadline}\nBody:\n${activeArticle.article.body}\n\nCurrent Yoast SEO fields:\nFocus Keyphrase: ${activeArticle.yoast?.focusKeyphrase || ""}\nSEO Title: ${activeArticle.yoast?.seoTitle || ""}\nMeta Description: ${activeArticle.yoast?.metaDescription || ""}\nSlug: ${activeArticle.yoast?.slug || ""}\n\nUser request: ${editPrompt}\n\nUse web search if you need current information. CRITICAL: Do NOT include any HTML tags, citation markers like cite tags, or reference indices in the article body. The body must be clean prose only with no XML or HTML. Then rewrite the article based on the user's request. Update Yoast SEO fields if relevant.\n\nReturn ONLY JSON, no markdown:\n{"article":{"headline":"","subheadline":"","body":"4+ paragraphs with ## subheadings, \\n\\n between paragraphs"},"yoast":{"focusKeyphrase":"","seoTitle":"","metaDescription":"","slug":""}}`;

      const r = await fetch("/api/anthropic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 4000, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }], messages: [{ role: "user", content: prompt }] })
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      const textBlocks = d.content?.filter(b => b.type === "text") || [];
      const raw = textBlocks.map(b => b.text).join("\n");
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Could not parse response");
      const parsed = JSON.parse(m[0]);
      if (parsed.article?.body) {
        parsed.article.body = parsed.article.body.replace(/<\/?cite[^>]*>/gi, "").replace(/[ \t]+/g, " ").replace(/ ([.,!?])/g, "$1").trim();
      }

      const updatedArticle = { ...activeArticle, article: parsed.article, yoast: parsed.yoast };
      setActiveArticle(updatedArticle);

      // Update in queue too
      const updatedAccounts = accounts.map(a => ({
        ...a,
        queue: (a.queue || []).map(item => item.id === activeArticle.id ? updatedArticle : item)
      }));
      saveAccounts(updatedAccounts);
      setEditPrompt("");
    } catch (e) {
      setError(`Edit failed: ${e.message}`);
    } finally {
      setEditingArticle(false);
    }
  };

  const publishToWordPress = (articleData) => {
    if (publishMethod === "wpcom" && wpcomToken) return publishToWordPressCom(articleData);
    return publishToWordPressBasic(articleData);
  };

  const removeFromQueue = (articleId) => {
    const updatedAccounts = accounts.map(a => ({ ...a, queue: (a.queue || []).filter(item => item.id !== articleId) }));
    saveAccounts(updatedAccounts);
    if (activeArticle?.id === articleId) setActiveArticle(null);
  };

  const clearAllQueue = () => {
    if (!confirm(`Delete all ${totalQueued} queued articles? This cannot be undone.`)) return;
    const updatedAccounts = accounts.map(a => ({ ...a, queue: [] }));
    saveAccounts(updatedAccounts);
    setActiveArticle(null);
    setPublishStatus(null);
  };

  const copyArticle = (articleData) => {
    navigator.clipboard.writeText(articleData.article.headline + "\n\n" + articleData.article.subheadline + "\n\n" + articleData.article.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const wpBasicConfigured = wpSaved && wpSiteUrl && wpUsername && wpAppPassword;
  const wpcomConnected = wpcomToken && wpcomBlogId;
  const wpConfigured = (publishMethod === "wpcom" ? wpcomConnected : wpBasicConfigured);
  const totalQueued = allQueued.length;

  const stripTags = (text) => text.replace(/<\/?cite[^>]*>/gi, "").replace(/<[^>]+>/g, "").replace(/[ \t]+/g, " ").trim();
  const renderArticleBody = (body) => body.split("\n\n").map((block, i) => {
    const cleaned = stripTags(block.replace(/^## /, ""));
    if (block.startsWith("## ")) return <h3 key={i} style={{ fontFamily: "'Poppins', sans-serif", fontSize: "1.15rem", fontWeight: 800, marginTop: "1.5rem", marginBottom: "0.4rem", color: "#0a2540" }}>{cleaned}</h3>;
    return <p key={i} style={{ marginBottom: "0.9rem", lineHeight: 1.75, color: "#0a2540", fontSize: "1.02rem" }}>{cleaned}</p>;
  });

  return (
    <div style={{ minHeight: "100vh", background: "#F0F8FF", fontFamily: "'Lora', serif", paddingBottom: "70px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; font-weight: 500; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        input:focus { border-color: #1a1a2e !important; box-shadow: 0 0 0 2px rgba(26,26,46,0.1); }
        .btn-primary:active { opacity: 0.8; }
        .tweet-card:active { background: #e8dcc8 !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #c8b99a; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, padding: "0.9rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#c4e0f0", borderBottom: "2px solid #0a2540" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {(activeArticle || tweetSelection) ? (
            <button onClick={() => { setActiveArticle(null); setTweetSelection(null); setPublishStatus(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#0a2540", padding: "2px", display: "flex" }}>
              <Icons.Back />
            </button>
          ) : (
            <div style={{ color: "#0a2540" }}><Icons.Newsletter /></div>
          )}
          <div>
            <h1 style={{ fontFamily: "'Poppins', sans-serif", fontSize: "1.45rem", fontWeight: 900, color: "#0a2540", letterSpacing: "-0.02em" }}>
              {tweetSelection ? `Pick Tweets` : activeArticle ? activeArticle.article?.headline?.substring(0, 28) + "..." : "The Wire"}
            </h1>
            {!activeArticle && !tweetSelection && <p style={{ fontSize: "0.72rem", color: "#0a2540", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "'Lora', serif" }}>Tweet-to-Article Intelligence</p>}
          </div>
        </div>
        {!activeArticle && !tweetSelection && totalQueued > 0 && (
          <span style={{ background: "#f5c842", color: "#0a2540", borderRadius: "12px", padding: "2px 9px", fontSize: "0.82rem", fontFamily: "'Poppins', sans-serif", fontWeight: 800 }}>{totalQueued} ready</span>
        )}
      </header>

      {/* Tweet Selection View */}
      {tweetSelection && !activeArticle && (
        <div style={{ padding: "1.25rem", animation: "slideUp 0.25s ease" }}>
          <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: "1.05rem", color: "#0a2540" }}>@{tweetSelection.account.handle}</p>
              <p style={{ fontSize: "0.82rem", color: "#0a2540", fontFamily: "'Lora', serif" }}>{tweetSelection.tweets.length} new tweets · {tweetSelection.selectedIds.size} selected</p>
            </div>
            <button onClick={selectAllTweets} style={{ padding: "6px 12px", border: "1.5px solid #0a2540", borderRadius: "5px", background: "transparent", color: "#0a2540", fontFamily: "'Lora', serif", fontSize: "0.88rem", cursor: "pointer" }}>
              {tweetSelection.selectedIds.size === tweetSelection.tweets.length ? "Deselect All" : "Select All"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "1rem" }}>
            {tweetSelection.tweets.map(t => {
              const selected = tweetSelection.selectedIds.has(t.tweetId);
              return (
                <div key={t.tweetId} className="tweet-card" onClick={() => toggleTweetSelection(t.tweetId)}
                  style={{ padding: "0.85rem 1rem", background: selected ? "#dbeaf4" : t.alreadyUsed ? "#a8cee0" : "#b8d8e8", borderRadius: "8px", border: `1.5px solid ${selected ? "#0a2540" : t.alreadyUsed ? "#5a8ba8" : "#7eb5d0"}`, cursor: "pointer", display: "flex", gap: "10px", alignItems: "flex-start", transition: "all 0.15s", opacity: t.alreadyUsed && !selected ? 0.7 : 1 }}>
                  <span style={{ color: selected ? "#c8a84b" : "#c8b99a", flexShrink: 0, marginTop: "1px" }}>
                    <Icons.CheckBox checked={selected} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "0.95rem", color: "#0a2540", fontFamily: "'Lora', serif", lineHeight: 1.5 }}>{t.text}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
                      <p style={{ fontSize: "0.75rem", color: "#0a2540", fontFamily: "'Lora', serif" }}>{t.date}</p>
                      {t.alreadyUsed && <span style={{ fontSize: "0.72rem", color: "#0a2540", fontFamily: "'Lora', serif", padding: "1px 7px", background: "#d4c5a9", borderRadius: "10px", fontWeight: 700 }}>Already used</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {loadingId === tweetSelection.account.id && generatingProgress.total > 0 && (
            <div style={{ marginBottom: "12px", padding: "10px 12px", background: "#c4e0f0", borderRadius: "6px" }}>
              <p style={{ fontSize: "0.88rem", color: "#0a2540", fontFamily: "'Lora', serif", marginBottom: "5px" }}>
                Generating article {generatingProgress.current} of {generatingProgress.total}...
              </p>
              <div style={{ background: "#d4c5a9", borderRadius: "4px", height: "4px", overflow: "hidden" }}>
                <div style={{ background: "#c8a84b", height: "100%", width: `${(generatingProgress.current / generatingProgress.total) * 100}%`, transition: "width 0.3s", borderRadius: "4px" }} />
              </div>
            </div>
          )}

          <button onClick={generateSelectedArticles} disabled={tweetSelection.selectedIds.size === 0 || loadingId !== null}
            style={{ width: "100%", padding: "14px", background: tweetSelection.selectedIds.size > 0 ? "#f5c842" : "#eee", border: "1.5px solid #0a2540", borderRadius: "8px", cursor: tweetSelection.selectedIds.size > 0 ? "pointer" : "not-allowed", fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: "1.05rem", color: tweetSelection.selectedIds.size > 0 ? "#0a2540" : "#999", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", opacity: loadingId ? 0.6 : 1 }}>
            <Icons.Refresh spinning={loadingId !== null} />
            {loadingId ? `Generating ${generatingProgress.current}/${generatingProgress.total}...` : `Generate ${tweetSelection.selectedIds.size} Article${tweetSelection.selectedIds.size !== 1 ? "s" : ""}`}
          </button>

          {error && <p style={{ color: "#c0392b", fontSize: "0.88rem", marginTop: "10px", fontFamily: "'Lora', serif" }}>{error}</p>}
        </div>
      )}

      {/* Article Detail View */}
      {activeArticle && !tweetSelection && (
        <div style={{ padding: "1.25rem", animation: "slideUp 0.25s ease" }}>
          <div style={{ marginBottom: "1.25rem", padding: "0.9rem 1rem", background: "#c4e0f0", borderRadius: "8px", borderLeft: "3px solid #c8a84b" }}>
            <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "#0a2540", fontFamily: "'Lora', serif", marginBottom: "0.5rem", fontWeight: 700 }}>Source tweet from @{activeArticle.handle}</p>
            <p style={{ fontSize: "0.95rem", color: "#0a2540", fontFamily: "'Lora', serif", lineHeight: 1.5 }}>{activeArticle.tweet.text}</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "5px" }}>
              <p style={{ fontSize: "0.75rem", color: "#0a2540", fontFamily: "'Lora', serif" }}>{activeArticle.tweet.date}</p>
              {activeArticle.tweet.tweetId && (
                <a href={`https://x.com/${activeArticle.handle}/status/${activeArticle.tweet.tweetId}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "#0073aa", fontFamily: "'Lora', serif", textDecoration: "none", display: "flex", alignItems: "center", gap: "3px" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  View tweet
                </a>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: "6px", marginBottom: "1rem", flexWrap: "wrap" }}>
            {activeArticle.assignedAuthor && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 9px", background: "#e8f5e9", border: "1px solid #a8dba8", borderRadius: "20px", fontSize: "0.78rem", color: "#2e7d32", fontFamily: "'Lora', serif" }}><Icons.User /> {activeArticle.assignedAuthor}</span>}
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 9px", background: "#dbeaf4", border: "1px solid #0a2540", borderRadius: "20px", fontSize: "0.78rem", color: "#0a2540", fontFamily: "'Lora', serif" }}><Icons.Tag /> {activeArticle.topic}</span>
          </div>

          {activeArticle.yoast && (
            <div style={{ marginBottom: "1.5rem", padding: "0.9rem 1rem", background: "#f0f7ff", borderRadius: "8px", border: "1.5px solid #b0d4f1", borderLeft: "3px solid #0073aa" }}>
              <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "#0073aa", fontFamily: "'Lora', serif", marginBottom: "0.75rem", fontWeight: 700 }}>Yoast SEO Fields</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[{ label: "Focus Keyphrase", value: activeArticle.yoast.focusKeyphrase }, { label: "SEO Title", value: activeArticle.yoast.seoTitle, note: `${(activeArticle.yoast.seoTitle || "").length}/60` }, { label: "Slug", value: activeArticle.yoast.slug }, { label: "Meta Description", value: activeArticle.yoast.metaDescription, note: `${(activeArticle.yoast.metaDescription || "").length}/155` }].map(field => (
                  <div key={field.label}>
                    <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#4a8fbe", fontFamily: "'Lora', serif", marginBottom: "2px", fontWeight: 700, display: "flex", justifyContent: "space-between" }}>{field.label}{field.note && <span style={{ color: parseInt(field.note) > parseInt(field.note.split("/")[1]) ? "#c0392b" : "#4caf50" }}>{field.note}</span>}</p>
                    <p style={{ fontSize: "0.88rem", color: "#1a2a3a", fontFamily: "'Lora', serif", background: "#fff", padding: "5px 7px", borderRadius: "3px", border: "1px solid #b0d4f1" }}>{field.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: "3px solid #0a2540", paddingTop: "1.5rem", marginBottom: "1.5rem" }}>
            <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.2em", color: "#c8a84b", fontFamily: "'Lora', serif", marginBottom: "0.6rem", fontWeight: 700 }}>Generated Article</p>
            <h1 style={{ fontFamily: "'Poppins', sans-serif", fontSize: "1.85rem", fontWeight: 900, lineHeight: 1.2, color: "#0a2540", marginBottom: "0.6rem" }}>{activeArticle.article.headline}</h1>
            <p style={{ fontFamily: "'Lora', serif", fontSize: "1.05rem", fontStyle: "italic", color: "#0a2540", marginBottom: "1.2rem", lineHeight: 1.5 }}>{activeArticle.article.subheadline}</p>
            <hr style={{ border: "none", borderTop: "1px solid #7eb5d0", marginBottom: "1.2rem" }} />
            <div>{renderArticleBody(activeArticle.article.body)}</div>
          </div>

          {/* Chat-edit box */}
          <div style={{ marginBottom: "1.25rem", padding: "0.9rem 1rem", background: "#F0F8FF", borderRadius: "8px", border: "1.5px solid #c8a84b" }}>
            <label style={{ ...labelStyle, color: "#0a2540" }}>Edit Article with Claude</label>
            <textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)} placeholder="e.g. 'Change the focus to annual passholders' or 'Look up the current ticket price and add it'" rows={2} style={{ ...inputStyle, marginBottom: "8px", resize: "vertical", fontFamily: "'Lora', serif" }} />
            <button onClick={editArticleWithPrompt} disabled={!editPrompt.trim() || editingArticle} style={{ width: "100%", padding: "10px", background: "#c8a84b", border: "1.5px solid #0a2540", borderRadius: "6px", cursor: editingArticle ? "wait" : "pointer", fontFamily: "'Lora', serif", fontSize: "0.95rem", color: "#0a2540", fontWeight: 700, opacity: (!editPrompt.trim() || editingArticle) ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
              <Icons.Refresh spinning={editingArticle} />
              {editingArticle ? "Rewriting with web search..." : "Apply Changes"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "1rem" }}>
            <button onClick={() => publishToWordPress(activeArticle)} disabled={publishingId === activeArticle.id || !wpConfigured}
              style={{ width: "100%", padding: "13px", border: `1.5px solid ${wpConfigured ? "#0073aa" : "#bbb"}`, borderRadius: "8px", cursor: wpConfigured ? "pointer" : "not-allowed", background: wpConfigured ? "#0073aa" : "#eee", color: wpConfigured ? "#fff" : "#999", fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", opacity: publishingId === activeArticle.id ? 0.6 : 1 }}>
              <Icons.WordPress />
              {publishingId === activeArticle.id ? "Publishing..." : `Publish ${publishMethod === "wpcom" ? "via Jetpack" : "to WordPress"}`}
            </button>
            <button onClick={() => copyArticle(activeArticle)} style={{ width: "100%", padding: "13px", border: "1.5px solid #0a2540", borderRadius: "8px", cursor: "pointer", background: copied ? "#e8f5e9" : "#f5c842", color: "#0a2540", fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}><Icons.Copy />{copied ? "Copied!" : "Copy Article"}</button>
            <button onClick={() => { removeFromQueue(activeArticle.id); setActiveArticle(null); }} style={{ width: "100%", padding: "12px", border: "1.5px solid #e8a99a", borderRadius: "8px", cursor: "pointer", background: "transparent", color: "#c0392b", fontFamily: "'Lora', serif", fontSize: "0.95rem" }}>Discard Article</button>
          </div>

          {publishStatus && (
            <div style={{ padding: "0.85rem 1rem", background: publishStatus.type === "success" ? "#f0faf0" : "#fdf0ee", border: `1px solid ${publishStatus.type === "success" ? "#a8dba8" : "#e8a99a"}`, borderRadius: "8px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <span style={{ color: publishStatus.type === "success" ? "#2e7d32" : "#c0392b", marginTop: "1px" }}>{publishStatus.type === "success" ? <Icons.Check /> : <Icons.Xmark />}</span>
              <div>
                <p style={{ fontSize: "0.92rem", fontFamily: "'Lora', serif", color: publishStatus.type === "success" ? "#2e7d32" : "#c0392b", fontWeight: 700 }}>{publishStatus.message}</p>
                {publishStatus.url && <a href={publishStatus.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.85rem", color: "#0073aa", fontFamily: "'Lora', serif", textDecoration: "underline" }}>Open in WordPress Editor →</a>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Tabs */}
      {!activeArticle && !tweetSelection && (
        <>
          {activeTab === "accounts" && (
            <div style={{ padding: "1.25rem", animation: "fadeIn 0.2s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: "1rem", fontWeight: 800, color: "#0a2540", textTransform: "uppercase", letterSpacing: "0.08em" }}>Tracked Accounts</p>
                <button onClick={() => setShowAddForm(!showAddForm)} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "7px 12px", border: "1.5px solid #0a2540", borderRadius: "6px", cursor: "pointer", fontSize: "0.88rem", background: showAddForm ? "#0a2540" : "transparent", color: showAddForm ? "#f5f0e8" : "#0a2540", fontFamily: "'Lora', serif" }}><Icons.Plus /> {showAddForm ? "Cancel" : "Add"}</button>
              </div>

              {showAddForm && (
                <div style={{ marginBottom: "1.25rem", padding: "1rem", background: "#c4e0f0", borderRadius: "8px", border: "1px solid #7eb5d0", animation: "fadeIn 0.2s ease" }}>
                  <label style={labelStyle}>Twitter/X Handle</label>
                  <input value={newHandle} onChange={e => setNewHandle(e.target.value)} placeholder="@handle" style={inputStyle} />
                  <label style={labelStyle}>Topic Focus</label>
                  <input value={newTopic} onChange={e => setNewTopic(e.target.value)} placeholder="e.g. Disney Parks news" style={{ ...inputStyle, marginBottom: "8px" }} />
                  <label style={labelStyle}>RSS Feed URL (from rss.app)</label>
                  <input value={newRssUrl} onChange={e => setNewRssUrl(e.target.value)} placeholder="https://rss.app/feeds/xxxxx.xml" style={{ ...inputStyle, marginBottom: "8px" }} />
                  {newTopic && resolveAuthor(newTopic, topicAuthors) && <p style={{ fontSize: "0.82rem", color: "#2e7d32", fontFamily: "'Lora', serif", marginBottom: "10px", display: "flex", alignItems: "center", gap: "4px" }}><Icons.Check /> Author: <strong>{resolveAuthor(newTopic, topicAuthors)}</strong></p>}
                  <button onClick={addAccount} style={{ width: "100%", padding: "12px", background: "#f5c842", border: "1.5px solid #0a2540", borderRadius: "6px", cursor: "pointer", fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: "1rem", color: "#0a2540" }}>Add Account</button>
                  {error && <p style={{ color: "#c0392b", fontSize: "0.85rem", marginTop: "6px" }}>{error}</p>}
                </div>
              )}

              {accounts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#0a2540" }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📰</div>
                  <p style={{ fontFamily: "'Poppins', sans-serif", fontStyle: "italic", fontSize: "1.1rem", marginBottom: "0.5rem" }}>No accounts yet.</p>
                  <p style={{ fontSize: "0.88rem", fontFamily: "'Lora', serif" }}>Tap Add to start tracking a Twitter/X account.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {accounts.map(account => {
                    const author = resolveAuthor(account.topic, topicAuthors);
                    const queueCount = (account.queue || []).length;
                    const isFetching = fetchingTweetsFor === account.id;
                    return (
                      <div key={account.id} style={{ padding: "1rem", background: "#dbeaf4", borderRadius: "8px", border: "1.5px solid #7eb5d0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                          <div>
                            <p style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: "1.1rem", color: "#0a2540" }}>@{account.handle}</p>
                            <p style={{ fontSize: "0.85rem", color: "#0a2540", fontFamily: "'Lora', serif", marginTop: "2px" }}>{account.topic}</p>
                            {author && <p style={{ fontSize: "0.8rem", color: "#5a8a6a", fontFamily: "'Lora', serif", marginTop: "2px", display: "flex", alignItems: "center", gap: "3px" }}><Icons.User /> {author}</p>}
                            <p style={{ fontSize: "0.78rem", color: "#0a2540", marginTop: "3px", fontFamily: "'Lora', serif" }}>Checked: {timeAgo(account.lastChecked)}</p>
                            {queueCount > 0 && <p style={{ fontSize: "0.78rem", color: "#c8a84b", marginTop: "2px", fontFamily: "'Lora', serif", fontWeight: 700 }}>{queueCount} in queue</p>}
                          </div>
                          <button onClick={() => removeAccount(account.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c8b99a", padding: "4px" }}><Icons.Trash /></button>
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button onClick={() => fetchTweetsForSelection(account)} disabled={isFetching} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", padding: "10px", border: "1.5px solid #0a2540", borderRadius: "6px", cursor: isFetching ? "wait" : "pointer", background: "#c4e0f0", color: "#0a2540", fontFamily: "'Lora', serif", fontSize: "0.92rem", opacity: isFetching ? 0.6 : 1 }}>
                            <Icons.Refresh spinning={isFetching} />
                            {isFetching ? "Fetching..." : "Fetch New Tweets"}
                          </button>
                          <button onClick={() => fetchTweetsForSelection(account, true)} disabled={isFetching} style={{ padding: "10px 12px", border: "1.5px solid #c8a84b", borderRadius: "6px", cursor: isFetching ? "wait" : "pointer", background: "transparent", color: "#0a2540", fontFamily: "'Lora', serif", fontSize: "0.92rem" }} title="Show all tweets including ones already used">
                            All
                          </button>
                          <button onClick={() => { if (confirm(`Clear history of ${(account.usedTweetIds || []).length} used tweets for @${account.handle}? You can re-fetch and re-draft them after.`)) clearTweetHistory(account.id); }} style={{ padding: "10px 12px", border: "1.5px solid #c8a84b", borderRadius: "6px", cursor: "pointer", background: "transparent", color: "#0a2540", fontFamily: "'Lora', serif", fontSize: "0.92rem" }} title="Clear cache of used tweets">
                            ↻
                          </button>
                          <button onClick={() => setShowManualInput(showManualInput === account.id ? null : account.id)} style={{ padding: "10px 12px", border: "1.5px solid #c8a84b", borderRadius: "6px", cursor: "pointer", background: showManualInput === account.id ? "#f5c842" : "transparent", color: "#0a2540", fontFamily: "'Lora', serif", fontSize: "0.92rem" }} title="Manual paste">
                            ✍
                          </button>
                        </div>
                        {showManualInput === account.id && (
                          <div style={{ marginTop: "10px", padding: "10px", background: "#dbeaf4", borderRadius: "6px", border: "1px solid #0a2540" }}>
                            <label style={labelStyle}>Paste Tweet Text</label>
                            <textarea value={manualTweetText} onChange={e => setManualTweetText(e.target.value)} placeholder="Paste tweet content here..." rows={3} style={{ ...inputStyle, marginBottom: "8px", resize: "vertical", fontFamily: "'Lora', serif" }} />
                            <button onClick={() => submitManualTweet(account)} disabled={!manualTweetText.trim()} style={{ width: "100%", padding: "9px", background: "#f5c842", border: "1.5px solid #0a2540", borderRadius: "6px", cursor: "pointer", fontFamily: "'Lora', serif", fontSize: "0.9rem", color: "#0a2540", fontWeight: 700, opacity: !manualTweetText.trim() ? 0.5 : 1 }}>
                              Generate Article from Tweet
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {error && <p style={{ color: "#c0392b", fontSize: "0.88rem", marginTop: "10px", fontFamily: "'Lora', serif" }}>{error}</p>}
            </div>
          )}

          {activeTab === "queue" && (
            <div style={{ padding: "1.25rem", animation: "fadeIn 0.2s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: "1rem", fontWeight: 800, color: "#0a2540", textTransform: "uppercase", letterSpacing: "0.08em" }}>Article Queue</p>
                  {totalQueued > 0 && <span style={{ background: "#f5c842", color: "#0a2540", borderRadius: "12px", padding: "2px 9px", fontSize: "0.82rem", fontFamily: "'Poppins', sans-serif", fontWeight: 800 }}>{totalQueued}</span>}
                </div>
                {totalQueued > 0 && (
                  <button onClick={clearAllQueue} style={{ padding: "7px 12px", border: "1.5px solid #c0392b", borderRadius: "6px", cursor: "pointer", background: "transparent", color: "#c0392b", fontFamily: "'Lora', serif", fontSize: "0.85rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "5px" }}>
                    <Icons.Trash /> Delete All
                  </button>
                )}
              </div>
              {totalQueued === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#0a2540" }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📋</div>
                  <p style={{ fontFamily: "'Poppins', sans-serif", fontStyle: "italic", fontSize: "1.1rem", marginBottom: "0.5rem" }}>Queue is empty.</p>
                  <p style={{ fontSize: "0.88rem", fontFamily: "'Lora', serif" }}>Pick tweets from an account to generate articles.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {allQueued.map(item => (
                    <div key={item.id} style={{ padding: "1rem", background: "#dbeaf4", borderRadius: "8px", border: "1.5px solid #7eb5d0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                        <div style={{ flex: 1, marginRight: "8px" }}>
                          <p style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: "1.02rem", color: "#0a2540", lineHeight: 1.3 }}>{item.article.headline}</p>
                          <p style={{ fontSize: "0.78rem", color: "#0a2540", fontFamily: "'Lora', serif", marginTop: "3px" }}>@{item.handle} · {item.tweet.date}</p>
                          {item.assignedAuthor && <p style={{ fontSize: "0.78rem", color: "#5a8a6a", fontFamily: "'Lora', serif", marginTop: "2px" }}>{item.assignedAuthor}</p>}
                        </div>
                        <button onClick={() => removeFromQueue(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c8b99a", padding: "4px", flexShrink: 0 }}><Icons.Trash /></button>
                      </div>
                      <p style={{ fontSize: "0.88rem", color: "#0a2540", fontFamily: "'Lora', serif", fontStyle: "italic", marginBottom: "10px", lineHeight: 1.4 }}>{item.article.subheadline}</p>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={() => setActiveArticle(item)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", padding: "9px", border: "1.5px solid #0a2540", borderRadius: "6px", cursor: "pointer", background: "#c4e0f0", color: "#0a2540", fontFamily: "'Lora', serif", fontSize: "0.9rem" }}><Icons.Article /> Read & Publish</button>
                        <button onClick={() => publishToWordPress(item)} disabled={publishingId === item.id || !wpConfigured} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", padding: "9px 12px", border: "1.5px solid #0073aa", borderRadius: "6px", cursor: wpConfigured ? "pointer" : "not-allowed", background: wpConfigured ? "#0073aa" : "#eee", color: wpConfigured ? "#fff" : "#999", fontFamily: "'Lora', serif", fontSize: "0.9rem", opacity: publishingId === item.id ? 0.6 : 1 }}><Icons.WordPress />{publishingId === item.id ? "..." : "Publish"}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {publishStatus && (
                <div style={{ marginTop: "1rem", padding: "0.85rem 1rem", background: publishStatus.type === "success" ? "#f0faf0" : "#fdf0ee", border: `1px solid ${publishStatus.type === "success" ? "#a8dba8" : "#e8a99a"}`, borderRadius: "8px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <span style={{ color: publishStatus.type === "success" ? "#2e7d32" : "#c0392b" }}>{publishStatus.type === "success" ? <Icons.Check /> : <Icons.Xmark />}</span>
                  <div>
                    <p style={{ fontSize: "0.92rem", fontFamily: "'Lora', serif", color: publishStatus.type === "success" ? "#2e7d32" : "#c0392b", fontWeight: 700 }}>{publishStatus.message}</p>
                    {publishStatus.url && <a href={publishStatus.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.85rem", color: "#0073aa", fontFamily: "'Lora', serif", textDecoration: "underline" }}>Open in WordPress Editor →</a>}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "authors" && (
            <div style={{ padding: "1.25rem", animation: "fadeIn 0.2s ease" }}>
              <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: "1rem", fontWeight: 800, color: "#0a2540", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>Topic Author Rules</p>
              <p style={{ fontSize: "0.85rem", color: "#0a2540", fontFamily: "'Lora', serif", marginBottom: "1.25rem", lineHeight: 1.6 }}>When a topic contains the keyword, that author is assigned in WordPress.</p>
              {topicAuthors.length > 0 && (
                <div style={{ marginBottom: "1.25rem", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {topicAuthors.map(ta => (
                    <div key={ta.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#dbeaf4", borderRadius: "8px", border: "1px solid #7eb5d0" }}>
                      <span style={{ fontFamily: "'Lora', serif", fontSize: "0.95rem", color: "#c8a84b", fontWeight: 700, flex: 1 }}>{ta.keyword}</span>
                      <span style={{ fontSize: "0.82rem", color: "#0a2540" }}>→</span>
                      <span style={{ fontFamily: "'Lora', serif", fontSize: "0.95rem", color: "#0a2540", flex: 1 }}>{ta.author}</span>
                      <button onClick={() => saveTopicAuthors(topicAuthors.filter(t => t.id !== ta.id))} style={{ background: "none", border: "none", cursor: "pointer", color: "#c8b99a", padding: "4px" }}><Icons.Trash /></button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ padding: "1rem", background: "#c4e0f0", borderRadius: "8px", border: "1px solid #7eb5d0" }}>
                <label style={labelStyle}>Topic Keyword</label>
                <input value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="e.g. Disney Parks" style={inputStyle} />
                <label style={labelStyle}>Author Name</label>
                <input value={newAuthor} onChange={e => setNewAuthor(e.target.value)} placeholder="e.g. Matthew Smith" style={{ ...inputStyle, marginBottom: "10px" }} />
                <button onClick={addTopicAuthor} disabled={!newKeyword.trim() || !newAuthor.trim()} style={{ width: "100%", padding: "12px", background: "#f5c842", border: "1.5px solid #0a2540", borderRadius: "6px", cursor: "pointer", fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: "1rem", color: "#0a2540", opacity: (!newKeyword.trim() || !newAuthor.trim()) ? 0.5 : 1 }}>Add Rule</button>
              </div>
            </div>
          )}

          {activeTab === "quick" && (
            <div style={{ padding: "1.25rem", animation: "fadeIn 0.2s ease" }}>
              <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: "1rem", fontWeight: 800, color: "#0a2540", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>Quick Article from Any Tweet</p>
              <p style={{ fontSize: "0.85rem", color: "#0a2540", fontFamily: "'Lora', serif", marginBottom: "1.25rem", lineHeight: 1.6 }}>
                Paste any tweet text to generate an article. No need to set up a tracked account.
              </p>

              <div style={{ padding: "1rem", background: "#dbeaf4", borderRadius: "8px", border: "1px solid #7eb5d0" }}>
                <label style={labelStyle}>Source Handle (optional)</label>
                <input value={quickHandle} onChange={e => setQuickHandle(e.target.value)} placeholder="@username (optional)" style={inputStyle} />

                <label style={labelStyle}>Topic / Focus</label>
                <input value={quickTopic} onChange={e => setQuickTopic(e.target.value)} placeholder="e.g. Disney Parks news, Marvel updates" style={inputStyle} />
                {quickTopic && resolveAuthor(quickTopic, topicAuthors) && <p style={{ fontSize: "0.82rem", color: "#2e7d32", fontFamily: "'Lora', serif", marginBottom: "10px", display: "flex", alignItems: "center", gap: "4px" }}><Icons.Check /> Author: <strong>{resolveAuthor(quickTopic, topicAuthors)}</strong></p>}

                <label style={labelStyle}>Tweet Text or URL</label>
                <textarea value={quickTweetText} onChange={e => setQuickTweetText(e.target.value)} placeholder="Paste tweet text OR a URL like https://x.com/user/status/123..." rows={4} style={{ ...inputStyle, marginBottom: "12px", resize: "vertical", fontFamily: "'Lora', serif" }} />

                <button onClick={generateQuickArticle} disabled={generatingQuick || !quickTweetText.trim() || !quickTopic.trim()} style={{ width: "100%", padding: "13px", background: "#c4e0f0", border: "1.5px solid #0a2540", borderRadius: "6px", cursor: generatingQuick ? "wait" : "pointer", fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: "1rem", color: "#0a2540", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", opacity: (generatingQuick || !quickTweetText.trim() || !quickTopic.trim()) ? 0.5 : 1 }}>
                  <Icons.Refresh spinning={generatingQuick} />
                  {generatingQuick ? "Generating with web search..." : "Generate Article"}
                </button>
              </div>

              {error && <p style={{ color: "#c0392b", fontSize: "0.88rem", marginTop: "10px", fontFamily: "'Lora', serif" }}>{error}</p>}
            </div>
          )}

          {activeTab === "wordpress" && (
            <div style={{ padding: "1.25rem", animation: "fadeIn 0.2s ease" }}>
              <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: "1rem", fontWeight: 800, color: "#0a2540", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>WordPress Connection</p>

              {/* Method toggle */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "1.25rem", background: "#c4e0f0", padding: "4px", borderRadius: "8px" }}>
                <button onClick={() => setPublishMethod("wpcom")} style={{ flex: 1, padding: "8px", border: "none", borderRadius: "6px", cursor: "pointer", background: publishMethod === "wpcom" ? "#0a2540" : "transparent", color: publishMethod === "wpcom" ? "#f5f0e8" : "#6b5a3e", fontFamily: "'Lora', serif", fontSize: "0.9rem", fontWeight: 700 }}>Jetpack (Recommended)</button>
                <button onClick={() => setPublishMethod("basic")} style={{ flex: 1, padding: "8px", border: "none", borderRadius: "6px", cursor: "pointer", background: publishMethod === "basic" ? "#0a2540" : "transparent", color: publishMethod === "basic" ? "#f5f0e8" : "#6b5a3e", fontFamily: "'Lora', serif", fontSize: "0.9rem", fontWeight: 700 }}>Direct</button>
              </div>

              {publishMethod === "wpcom" ? (
                <div>
                  <p style={{ fontSize: "0.88rem", color: "#0a2540", fontFamily: "'Lora', serif", marginBottom: "1rem", lineHeight: 1.6 }}>
                    Connect via Jetpack/WordPress.com. This bypasses host firewalls and works with GoDaddy Managed Hosting. Requires this app to be deployed at a real URL (e.g. Vercel) -- OAuth does not work inside Claude artifacts.
                  </p>
                  {wpcomConnected ? (
                    <div style={{ padding: "1rem", background: "#f0faf0", borderRadius: "8px", border: "1.5px solid #a8dba8", marginBottom: "10px" }}>
                      <p style={{ fontSize: "0.95rem", fontFamily: "'Lora', serif", color: "#2e7d32", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}><Icons.Check /> Connected to WordPress.com</p>
                      {wpcomUser && <p style={{ fontSize: "0.85rem", color: "#0a2540", fontFamily: "'Lora', serif" }}>As: {wpcomUser}</p>}
                      <p style={{ fontSize: "0.8rem", color: "#0a2540", fontFamily: "'Lora', serif", marginTop: "3px" }}>Site ID: {wpcomBlogId}</p>
                      <button onClick={disconnectWordPressCom} style={{ marginTop: "10px", padding: "8px 14px", background: "transparent", border: "1.5px solid #c0392b", borderRadius: "5px", cursor: "pointer", color: "#c0392b", fontFamily: "'Lora', serif", fontSize: "0.9rem" }}>Disconnect</button>
                    </div>
                  ) : (
                    <button onClick={connectWordPressCom} style={{ width: "100%", padding: "14px", background: "#0073aa", border: "1.5px solid #0073aa", borderRadius: "8px", cursor: "pointer", fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: "1rem", color: "#0a2540", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}>
                      <Icons.WordPress /> Connect with WordPress.com
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: "0.85rem", color: "#0a2540", fontFamily: "'Lora', serif", marginBottom: "1.25rem", lineHeight: 1.6 }}>Generate an Application Password in WP Admin under Users → Profile.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "14px" }}>
                    <div><label style={labelStyle}>Site URL</label><input value={wpSiteUrl} onChange={e => setWpSiteUrl(e.target.value)} placeholder="https://yoursite.com" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Username</label><input value={wpUsername} onChange={e => setWpUsername(e.target.value)} placeholder="your_username" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Application Password</label><input value={wpAppPassword} onChange={e => setWpAppPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" type="password" style={inputStyle} /></div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <button onClick={saveWpSettings} style={{ width: "100%", padding: "12px", background: "#f5c842", border: "1.5px solid #0a2540", borderRadius: "6px", cursor: "pointer", fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: "1rem", color: "#0a2540" }}>Save Settings</button>
                    <button onClick={testWpConnection} disabled={testingWp || !wpSiteUrl || !wpUsername || !wpAppPassword} style={{ width: "100%", padding: "12px", background: "transparent", border: "1.5px solid #0073aa", borderRadius: "6px", cursor: "pointer", fontFamily: "'Lora', serif", fontSize: "1rem", color: "#0073aa", opacity: (testingWp || !wpSiteUrl || !wpUsername || !wpAppPassword) ? 0.5 : 1 }}>{testingWp ? "Testing..." : "Test Connection"}</button>
                  </div>
                  {wpTestResult && (
                    <div style={{ marginTop: "12px", padding: "0.85rem 1rem", background: wpTestResult.success ? "#f0faf0" : "#fdf0ee", border: `1px solid ${wpTestResult.success ? "#a8dba8" : "#e8a99a"}`, borderRadius: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: wpTestResult.success ? "#2e7d32" : "#c0392b" }}>{wpTestResult.success ? <Icons.Check /> : <Icons.Xmark />}</span>
                      <p style={{ fontSize: "0.92rem", fontFamily: "'Lora', serif", color: wpTestResult.success ? "#2e7d32" : "#c0392b", fontWeight: 700 }}>{wpTestResult.message}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Bottom Nav */}
      {!activeArticle && !tweetSelection && (
        <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#c4e0f0", borderTop: "2px solid #0a2540", display: "flex", zIndex: 100 }}>
          {NAV_TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: "12px 8px 10px", background: activeTab === tab.id ? "rgba(10,37,64,0.12)" : "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", borderTop: activeTab === tab.id ? "2px solid #0a2540" : "2px solid transparent", transition: "all 0.15s", position: "relative" }}>
              {tab.id === "queue" && totalQueued > 0 && <span style={{ position: "absolute", top: "6px", right: "18px", background: "#f5c842", color: "#0a2540", borderRadius: "8px", padding: "0px 5px", fontSize: "0.55rem", fontWeight: 800, fontFamily: "'Poppins', sans-serif" }}>{totalQueued}</span>}
              <span style={{ color: "#0a2540" }}>{Icons[tab.icon]()}</span>
              <span style={{ fontSize: "0.72rem", color: "#0a2540", fontFamily: "'Lora', serif", letterSpacing: "0.05em" }}>{tab.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}