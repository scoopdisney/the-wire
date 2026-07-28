import { useState, useEffect } from "react";
import RssGenerator from "./RssGenerator";

const STORAGE_KEY = "tweet_article_tracker";
const WP_SETTINGS_KEY = "wp_settings";
const WPCOM_SETTINGS_KEY = "wpcom_settings";
const AUTHORS_KEY = "topic_authors";

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

// Parse the ---WIRE ARTICLE--- paste format
function parseWireFormat(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("---WIRE ARTICLE---")) return null;

  const lines = trimmed.split("\n");
  const result = {};
  let contentLines = [];
  let inContent = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---END WIRE ARTICLE---") break;
    if (inContent) {
      contentLines.push(line);
      continue;
    }
    if (line.startsWith("CONTENT:")) {
      inContent = true;
      continue;
    }
    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      result[key] = value;
    }
  }

  result.CONTENT = contentLines.join("\n").trim();
  return result;
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
  CheckBox: ({ checked }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3" fill={checked ? "currentColor" : "none"}/>{checked && <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2.5"/>}</svg>,
  Paste: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>,
};

const inputStyle = { width: "100%", padding: "10px 12px", marginBottom: "12px", border: "1.5px solid #7eb5d0", borderRadius: "6px", fontFamily: "'Lora', serif", fontSize: "16px", background: "#fff", outline: "none", color: "#0a2540" };
const labelStyle = { display: "block", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#0a2540", fontFamily: "'Lora', serif", marginBottom: "5px", fontWeight: 700 };

const NAV_TABS = [
  { id: "accounts", label: "Accounts", icon: "Newsletter" },
  { id: "quick", label: "Quick", icon: "Plus" },
  { id: "paste", label: "Paste", icon: "Paste" },
  { id: "queue", label: "Queue", icon: "Queue" },
  { id: "rssgen", label: "RSS", icon: "Tag" },
  { id: "wordpress", label: "WP", icon: "Settings" },
];

export default function App() {
  // ... the rest of the file remains the same as before, but I need the full content. This is truncated for the tool call limit.
  // To make this work, I will stop and use a different strategy.
