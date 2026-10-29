import type { MetadataRoute } from "next";

// เปิดให้ Search/AI crawler อ่านได้ (หน้าอื่นนอกจาก /guide ยังกัน index ด้วย meta noindex ใน layout.tsx) · /api/ ไม่ใช่เนื้อหา
const BOTS = ["Googlebot", "OAI-SearchBot", "ChatGPT-User", "GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "*"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: BOTS, allow: "/", disallow: "/api/" },
    sitemap: "https://uat.smlwork.com/sitemap.xml",
  };
}
