import { useState } from "react";

const Icons = {
  Refresh: ({ spinning }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ animation: spinning ? "spin 1s linear infinite" : "none" }}>
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  ),
  Download: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  ),
  Copy: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  ),
  External: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
    </svg>
  ),
};

function extractTwitter(input) {
  const m = input.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)/i)
    || input.match(/^@?([A-Za-z0-9_]{1,15})$/);
  return m ? m[1] : null;
}

function extractInstagram(input) {
  const m = input.match(/(?:instagram\.com|instagr\.am)\/([A-Za-z0-9._]+)/i)
    || input.match(/^@?([A-Za-z0-9._]{1,30})$/);
  return m ? m[1].replace(/\/$/, "") : null;
}

export default function RssGenerator() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [previewItems, setPreviewItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = () => {
    setError("");
    setResult(null);
    setPreviewItems([]);
    const raw = input.trim();
    if (!raw) {
      setError("Paste a profile URL or username");
      return;
    }

    // Twitter / X
    const tw = extractTwitter(raw);
    if (tw && !raw.toLowerCase().includes("instagram")) {
      const feeds = [
        {
          name: "rss.app (recommended)",
          url: null,
          note: "Most reliable long-term option. Free accounts work. Create once and the feed stays stable.",
          actionUrl: "https://rss.app/rss-feed/create-twitter-rss-feed",
        },
        {
          name: "RSSHub · rssforever",
          url: `https://rsshub.rssforever.com/twitter/user/${tw}`,
          note: "Public instance — works more often than the main one",
        },
        {
          name: "RSSHub · rss.tips",
          url: `https://rsshub.rss.tips/twitter/user/${tw}`,
          note: "Another public instance",
        },
        {
          name: "RSSHub · main (often down)",
          url: `https://rsshub.app/twitter/user/${tw}`,
          note: "Frequently returns 404 — keep as last resort",
        },
      ];
      setResult({ platform: "twitter", username: tw, feeds });
      return;
    }

    // Instagram
    const ig = extractInstagram(raw);
    if (ig) {
      const feeds = [
        {
          name: "rss.app (recommended)",
          url: null,
          note: "Instagram is heavily restricted. rss.app is the only consistently working free option.",
          actionUrl: "https://rss.app",
        },
        {
          name: "RSSHub + Picuki · rssforever",
          url: `https://rsshub.rssforever.com/picuki/profile/${ig}`,
          note: "Best free Instagram route when the instance is up",
        },
        {
          name: "RSSHub + Picuki · main",
          url: `https://rsshub.app/picuki/profile/${ig}`,
          note: "Often down",
        },
      ];
      setResult({ platform: "instagram", username: ig, feeds });
      return;
    }

    setError("Could not detect a valid Instagram or X/Twitter profile. Paste the full profile URL.");
  };

  const fetchAndPreview = async (feedUrl) => {
    if (!feedUrl) return;
    setLoading(true);
    setError("");
    setPreviewItems([]);
    try {
      const proxy = `/api/rss?url=${encodeURIComponent(feedUrl)}`;
      const res = await fetch(proxy);
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      const text = await res.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/xml");
      const items = Array.from(doc.querySelectorAll("item, entry")).slice(0, 6);

      if (items.length === 0) throw new Error("No items found in feed");

      const parsed = items.map((item) => {
        const title = item.querySelector("title")?.textContent || "(no title)";
        const link = item.querySelector("link")?.textContent
          || item.querySelector("link")?.getAttribute("href") || "";
        const date = item.querySelector("pubDate, published, updated")?.textContent || "";
        return { title: title.trim().substring(0, 120), link, date };
      });

      setPreviewItems(parsed);
    } catch (e) {
      setError(`Preview failed: ${e.message}. Free public instances go down often — use the rss.app option for a permanent feed.`);
    } finally {
      setLoading(false);
    }
  };

  const downloadXml = async (feedUrl, username) => {
    if (!feedUrl) return;
    setLoading(true);
    setError("");
    try {
      const proxy = `/api/rss?url=${encodeURIComponent(feedUrl)}`;
      const res = await fetch(proxy);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const text = await res.text();

      const blob = new Blob([text], { type: "application/rss+xml" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${username || "feed"}-rss.xml`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(`Download failed: ${e.message}. The free instance is currently down.`);
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={{ padding: "1.25rem", animation: "fadeIn 0.2s ease" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <p style={{
        fontFamily: "'Poppins', sans-serif",
        fontSize: "1rem",
        fontWeight: 800,
        color: "#0a2540",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: "0.4rem"
      }}>
        IG + Twitter → RSS
      </p>
      <p style={{
        fontSize: "0.85rem",
        color: "#0a2540",
        fontFamily: "'Lora', serif",
        marginBottom: "1.25rem",
        lineHeight: 1.6
      }}>
        Paste any public Instagram or X/Twitter profile link (or just the username).  
        Free public bridges go down often — for anything important use the rss.app option.
      </p>

      {/* Input */}
      <div style={{
        padding: "1rem",
        background: "#dbeaf4",
        borderRadius: "8px",
        border: "1px solid #7eb5d0",
        marginBottom: "1.25rem"
      }}>
        <label style={{
          display: "block",
          fontSize: "0.8rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "#0a2540",
          fontFamily: "'Lora', serif",
          marginBottom: "5px",
          fontWeight: 700
        }}>
          Profile URL or Username
        </label>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate()}
          placeholder="https://x.com/Disney  or  @disney  or  instagram.com/disney"
          style={{
            width: "100%",
            padding: "10px 12px",
            marginBottom: "12px",
            border: "1.5px solid #7eb5d0",
            borderRadius: "6px",
            fontFamily: "'Lora', serif",
            fontSize: "16px",
            background: "#fff",
            outline: "none",
            color: "#0a2540"
          }}
        />
        <button
          onClick={generate}
          style={{
            width: "100%",
            padding: "13px",
            background: "#f5c842",
            border: "1.5px solid #0a2540",
            borderRadius: "8px",
            cursor: "pointer",
            fontFamily: "'Poppins', sans-serif",
            fontWeight: 800,
            fontSize: "1rem",
            color: "#0a2540"
          }}
        >
          Generate Feed
        </button>
      </div>

      {error && (
        <p style={{
          color: "#c0392b",
          fontSize: "0.88rem",
          marginBottom: "1rem",
          fontFamily: "'Lora', serif"
        }}>
          {error}
        </p>
      )}

      {/* Results */}
      {result && (
        <div>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 12px",
            borderRadius: "20px",
            fontSize: "0.78rem",
            fontWeight: 700,
            marginBottom: "14px",
            background: result.platform === "twitter" ? "#1d9bf0" : "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",
            color: "white"
          }}>
            {result.platform === "twitter" ? "𝕏 / Twitter" : "Instagram"} · @{result.username}
          </div>

          {result.feeds.map((feed, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: "14px",
                padding: "1rem",
                background: "#c4e0f0",
                borderRadius: "8px",
                border: "1.5px solid #7eb5d0"
              }}
            >
              <p style={{
                fontFamily: "'Poppins', sans-serif",
                fontWeight: 700,
                fontSize: "0.95rem",
                color: "#0a2540",
                marginBottom: "4px"
              }}>
                {feed.name}
              </p>
              <p style={{
                fontSize: "0.8rem",
                color: "#0a2540",
                fontFamily: "'Lora', serif",
                marginBottom: "10px"
              }}>
                {feed.note}
              </p>

              {feed.url ? (
                <>
                  <div style={{
                    background: "#fff",
                    border: "1px solid #7eb5d0",
                    borderRadius: "6px",
                    padding: "10px 12px",
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "0.8rem",
                    wordBreak: "break-all",
                    color: "#0a2540",
                    marginBottom: "10px"
                  }}>
                    {feed.url}
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      onClick={() => copyUrl(feed.url)}
                      style={{
                        flex: 1,
                        minWidth: "110px",
                        padding: "9px",
                        border: "1.5px solid #0a2540",
                        borderRadius: "6px",
                        background: copied ? "#e8f5e9" : "#fff",
                        color: "#0a2540",
                        fontFamily: "'Lora', serif",
                        fontSize: "0.88rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "5px"
                      }}
                    >
                      <Icons.Copy /> {copied ? "Copied!" : "Copy URL"}
                    </button>
                    <button
                      onClick={() => fetchAndPreview(feed.url)}
                      disabled={loading}
                      style={{
                        flex: 1,
                        minWidth: "110px",
                        padding: "9px",
                        border: "1.5px solid #0a2540",
                        borderRadius: "6px",
                        background: "#c4e0f0",
                        color: "#0a2540",
                        fontFamily: "'Lora', serif",
                        fontSize: "0.88rem",
                        cursor: loading ? "wait" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "5px",
                        opacity: loading ? 0.6 : 1
                      }}
                    >
                      <Icons.Refresh spinning={loading} /> Preview
                    </button>
                    <button
                      onClick={() => downloadXml(feed.url, result.username)}
                      disabled={loading}
                      style={{
                        flex: 1,
                        minWidth: "110px",
                        padding: "9px",
                        border: "1.5px solid #0a2540",
                        borderRadius: "6px",
                        background: "#f5c842",
                        color: "#0a2540",
                        fontFamily: "'Lora', serif",
                        fontSize: "0.88rem",
                        cursor: loading ? "wait" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "5px",
                        opacity: loading ? 0.6 : 1
                      }}
                    >
                      <Icons.Download /> Download XML
                    </button>
                  </div>
                </>
              ) : (
                <a
                  href={feed.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "9px 14px",
                    background: "#0a2540",
                    color: "#f5f0e8",
                    borderRadius: "6px",
                    textDecoration: "none",
                    fontFamily: "'Lora', serif",
                    fontSize: "0.9rem",
                    fontWeight: 600
                  }}
                >
                  <Icons.External /> Open rss.app
                </a>
              )}
            </div>
          ))}

          {/* Live Preview */}
          {previewItems.length > 0 && (
            <div style={{
              marginTop: "1.25rem",
              padding: "1rem",
              background: "#f0f7ff",
              borderRadius: "8px",
              border: "1.5px solid #b0d4f1"
            }}>
              <p style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "#0073aa",
                fontFamily: "'Lora', serif",
                marginBottom: "0.75rem",
                fontWeight: 700
              }}>
                Live Preview (first {previewItems.length} items)
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {previewItems.map((item, i) => (
                  <div key={i} style={{
                    padding: "10px 12px",
                    background: "#fff",
                    borderRadius: "6px",
                    border: "1px solid #b0d4f1"
                  }}>
                    <p style={{
                      fontSize: "0.9rem",
                      color: "#0a2540",
                      fontFamily: "'Lora', serif",
                      fontWeight: 600,
                      marginBottom: "3px"
                    }}>
                      {item.title}
                    </p>
                    {item.date && (
                      <p style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {new Date(item.date).toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
