// เรนเดอร์แผนภาพ docs/workflow/*.html เป็น PNG 1920px (คมชัด ×2) + WebP (ต้องมี ffmpeg) ลง public/guide/ ให้หน้าคู่มือ /guide ใช้
// ใช้: node docs/workflow/render.mjs [1-overview 2-loop 3-run]
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "..", "public", "guide");
const pw = process.env.UAT_PLAYWRIGHT || "D:/smlaiaccount/tests/playwright/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(pw).href);
const names = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(here).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5));

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
for (const n of names) {
  await page.goto(pathToFileURL(join(here, `${n}.html`)).href);
  await page.waitForSelector("body[data-ready]");
  await page.screenshot({ path: join(out, `${n}.png`), fullPage: true });
  // หน้าเว็บคู่มือแสดง WebP กว้าง 1920 (เล็กกว่า PNG ~15 เท่า) ส่วน PNG ไว้เปิดภาพเต็ม
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(out, `${n}.png`), "-vf", "scale=1920:-1", "-c:v", "libwebp", "-quality", "82", join(out, `${n}.webp`)]);
  console.log(`${n}.png`);
}
await browser.close();
