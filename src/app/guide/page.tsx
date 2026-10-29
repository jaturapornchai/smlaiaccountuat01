import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";

// คู่มือใช้งานสำหรับเพื่อนๆ: ภาพ Workflow 3 ภาพ (สร้างจาก docs/workflow/*.html ด้วย render.mjs) + วิธีอ่านหน้าเว็บ
const SITE = "https://uat.smlwork.com";
const TITLE = "คู่มือใช้งาน UAT Tester · ฝูงบอททดสอบ SML AI Account";
const DESC = "อธิบายวิธีทำงานของ UAT Tester: บอท 32 ตัวทดสอบ SML AI Account ทั้งหน้าจอ API และฐานข้อมูล Demo ไม่ผ่านเปิด issue ใน IssueMate เอง พร้อมภาพ Workflow 3 ภาพ";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESC,
  robots: { index: true, follow: true }, // หน้านี้หน้าเดียวให้ค้นเจอ ส่วนอื่นของเว็บยัง noindex ตาม layout.tsx
  alternates: { canonical: "/guide" },
  openGraph: { type: "article", url: "/guide", title: TITLE, description: DESC, locale: "th_TH", images: [{ url: "/guide/1-overview.png", width: 3840, height: 2200, alt: "ภาพรวมระบบ UAT Tester" }] },
};

const FIGS = [
  {
    id: "overview",
    file: "1-overview",
    h: [3840, 2200],
    title: "ภาพที่ 1 · ภาพรวมระบบ",
    alt: "ภาพรวมระบบ UAT Tester: AI นักพัฒนา ผู้ดูแล และผู้ชม สั่งงานหรือดูผลผ่านหน้าเว็บและ MCP ตัวรันทดสอบกับ www.smlwork.com และฐาน smldemo ไม่ผ่านส่งสมอง AI วิเคราะห์แล้วเปิด issue ใน IssueMate",
    points: [
      "ใครก็เปิดดูหน้าเว็บได้ แต่การสั่งรัน ตั้งค่า ถาม AI และส่ง issue ทำได้เฉพาะผู้ดูแลที่เข้าระบบด้วย Google",
      "AI นักพัฒนา (Claude Code / Antigravity) สั่งงานผ่านช่อง MCP ที่ /api/mcp โดยใช้ token",
      "ทุกคำสั่งรันเข้าคิวก่อน รันพร้อมกันได้สูงสุด 5 รอบ (ผู้ดูแลปรับได้ 1–10)",
      "ตัวรันทดสอบกับของจริงทั้งหมด: เว็บ www.smlwork.com (เข้าแบบ Demo) และฐาน PostgreSQL smldemo เท่านั้น",
      "รอบที่ไม่ผ่าน สมอง AI อ่านขั้นที่พังพร้อมภาพหน้าจอ แล้วระบบเปิด issue ในโปรเจกต์ SMLAIACC ของ IssueMate",
    ],
  },
  {
    id: "loop",
    file: "2-loop",
    h: [3840, 2160],
    title: "ภาพที่ 2 · วงจร AI แก้ → ทดสอบ → แจ้ง → แก้ซ้ำ",
    alt: "วงจร 6 ขั้น: AI แก้โค้ด สั่งทดสอบผ่าน MCP บอททดสอบของจริง ไม่ผ่านให้สมอง AI วิเคราะห์ เปิด issue ใน IssueMate แล้ว AI อ่าน issue แก้และตรวจซ้ำจนผ่าน",
    points: [
      "AI แก้โปรแกรมเสร็จ เรียกคำสั่ง run ผ่าน MCP แล้วรอผลได้ถึง 90 วินาที หรือติดตามด้วย events",
      "ผ่าน: ถ้าเคยมี issue ระบบคอมเมนต์ใน issue เดิมว่าตรวจซ้ำผ่านแล้ว หน้าเว็บขึ้นป้ายพร้อมพลุกระดาษ",
      "ไม่ผ่าน: สมอง AI เขียนสาเหตุที่น่าจะเป็น (เป็นการคาดเดา ต้องตรวจโค้ดจริงเสมอ) แล้วเปิด issue พร้อมขั้นตอนทำซ้ำ ภาพ และ run.json",
      "ระดับปัญหาแปลงเป็นความสำคัญของ issue: S1→critical, S2→high, S3→medium, S4→low · ปัญหาเดิมไม่เปิด issue ซ้ำ",
      "AI แก้ตาม issue แล้วสั่ง run แบบระบุเลข issue ระบบรันซ้ำเฉพาะสคริปต์ของ issue นั้น วนจนผ่าน",
    ],
  },
  {
    id: "run",
    file: "3-run",
    h: [3840, 2160],
    title: "ภาพที่ 3 · ข้างในการรันสคริปต์ 1 รอบ",
    alt: "ขั้นตอนการรัน: สคริปต์ JSON เข้าคิว ตัวรันทำทีละขั้น 4 ชนิด คือหน้าจอ ตรวจจอสะอาด API และฐานข้อมูล ขั้น cleanup รันเสมอ แล้วแยกผลผ่านหรือไม่ผ่าน",
    points: [
      "สคริปต์ทดสอบเป็นไฟล์ JSON ในโฟลเดอร์ uat-scripts (ตอนนี้ 31 ชุด) AI เพิ่มเองได้ด้วยคำสั่ง save_script",
      "หน้าจอ (ui.*): Chrome ผ่าน Playwright เปิดเมนู กรอก กด แล้วตรวจข้อความ/ค่า และถ่ายภาพจอสดให้การ์ดบอท",
      "จอต้องสะอาด (ui.expectClean): ห้ามมี HTTP 4xx/5xx ห้ามมี error ใน JS/console และห้ามมีข้อความ error ฐานข้อมูลบนจอ",
      "API (api.request) ตรวจสถานะ HTTP และค่าใน JSON · ฐานข้อมูล (db.query / db.exec) ตรวจทีละแถว แตะได้เฉพาะ smldemo",
      "ขั้น cleanup รันเสมอแม้ขั้นหลักพัง ผลทุกรอบเก็บใน runs/<id>/run.json พร้อมภาพและไฟล์หลักฐาน",
    ],
  },
];

const HOWTO = [
  ["การ์ดบอท", "หน้าแรกมีการ์ด 30 ใบ เรียงบอทที่กำลังรันก่อน แล้วตามเวลาทำงานล่าสุด จอบนการ์ดคือภาพหน้าจอล่าสุด แถบล่างบอกว่ากำลังทำขั้นไหน ป้ายแดง \"สด\" แปลว่ากำลังรันอยู่"],
  ["ดูทุกขั้นตอน", "กดที่จอบนการ์ด จะเปิดรอบการรันนั้น เห็นทุกขั้น ค่าที่คาดหวังเทียบค่าที่ได้จริง และภาพหลักฐาน"],
  ["ไฟสถานะด้านบน", "บอกว่าเว็บ ERP, ฐาน Demo, สมอง AI และ IssueMate พร้อมใช้งานหรือไม่"],
  ["ปุ่ม ▶ และ ✨", "▶ รันสคริปต์ของบอทตัวนั้น · ✨ สั่งบอท AI ให้วางแผนหรือชี้จุดเสี่ยง ทั้งสองปุ่มใช้ได้เฉพาะผู้ดูแล คนอื่นจะได้ข้อความ \"ดูได้อย่างเดียว\""],
  ["แอนิเมชัน", "มีคำสั่งจาก AI เข้ามาจะมีลำแสงพุ่งจากมุมขวาบน รอบจบขอบจอเรืองเขียว (ผ่าน) หรือกะพริบแดง (ไม่ผ่าน)"],
];

const FAQ = [
  ["ทำไมบอทมี 32 ตัว", "10 โมดูล (ข้อมูลหลัก งานขาย งานซื้อ สต็อก บัญชี GL ภาษี รายงาน สิทธิ์ความปลอดภัย แอดมิน กระทบยอด) × 3 มุมตรวจ (หน้าจอ ฐานข้อมูล API) + เงินสด/ธนาคาร 2 มุม (หน้าจอ ฐานข้อมูล)"],
  ["ทดสอบกับข้อมูลลูกค้าจริงไหม", "ไม่ ตัวรันยอมให้แตะเฉพาะฐาน Demo ชื่อ smldemo และเข้าเว็บด้วยปุ่ม Demo"],
  ["บทวิเคราะห์ของสมอง AI เชื่อได้แค่ไหน", "เป็นการคาดเดาจากขั้นที่พังและภาพหน้าจอ ต้องตรวจโค้ดจริงก่อนแก้ทุกครั้ง"],
  ["ทำไมกดรันไม่ได้", "การสั่งงานต้องเข้าระบบด้วย Google บัญชีผู้ดูแล คนอื่นดูผลได้ทุกหน้าแต่สั่งงานไม่ได้"],
  ["จะเปิด issue ซ้ำไหม", "ไม่ ระบบจำสคริปต์และขั้นที่พังที่ส่งไปแล้ว เมื่อสคริปต์กลับมาผ่านจึงล้างรายการและคอมเมนต์ใน issue เดิม"],
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "TechArticle", headline: TITLE, description: DESC, inLanguage: "th", url: `${SITE}/guide`, image: FIGS.map((f) => `${SITE}/guide/${f.file}.png`) },
    { "@type": "SoftwareApplication", name: "UAT Tester · SML AI Account", applicationCategory: "DeveloperApplication", operatingSystem: "Web", url: SITE, inLanguage: "th", description: DESC },
    { "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ],
};

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-6xl px-[clamp(1rem,3vw,2.5rem)] py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/" className="baseline-center gap-2 text-sm text-slate-400 transition hover:text-cyan-200">
        <ArrowLeft className="h-4 w-4" />
        กลับหน้าฝูงบอท
      </Link>

      <header className="mt-5">
        <h1 className="baseline-center gap-3 text-[clamp(1.6rem,3.4vw,2.6rem)] font-extrabold leading-tight">
          <BookOpen className="h-[1em] w-[1em] shrink-0 text-cyan-300" />
          {TITLE}
        </h1>
        <p className="mt-3 max-w-4xl text-[1.02rem] leading-relaxed text-slate-300">
          UAT Tester คือเว็บที่ให้บอท 32 ตัวทดสอบโปรแกรมบัญชี SML AI Account (www.smlwork.com) ตามสคริปต์ทีละขั้น ทั้งหน้าจอ API และฐานข้อมูล Demo เจอปัญหาจะเปิด issue ใน IssueMate ให้เอง
          นักพัฒนาที่เป็น AI สั่งทดสอบซ้ำได้เองจนกว่าจะผ่าน ส่วนเพื่อนๆ เปิดดูผลได้ทุกหน้าโดยไม่ต้องล็อกอิน
        </p>
        <nav aria-label="สารบัญ" className="mt-4 flex flex-wrap gap-2 text-sm">
          {[...FIGS.map((f) => [f.id, f.title.split(" · ")[1]]), ["howto", "วิธีดูหน้าเว็บ"], ["mcp", "เชื่อม AI ผ่าน MCP"], ["faq", "คำถามที่พบบ่อย"]].map(([id, t]) => (
            <a key={id} href={`#${id}`} className="glass rounded-full px-3 py-1 text-slate-200 transition hover:text-cyan-200">
              {t}
            </a>
          ))}
        </nav>
      </header>

      {FIGS.map((f) => (
        <section key={f.id} id={f.id} className="mt-12 scroll-mt-6">
          <h2 className="text-[1.45rem] font-bold">{f.title}</h2>
          <figure className="glass mt-4 overflow-hidden rounded-3xl">
            <a href={`/guide/${f.file}.png`} target="_blank" rel="noopener" title="เปิดภาพเต็ม (PNG)">
              <img src={`/guide/${f.file}.webp`} alt={f.alt} width={1920} height={Math.round((f.h[1] * 1920) / f.h[0])} loading={f.id === "overview" ? "eager" : "lazy"} className="h-auto w-full" />
            </a>
            <figcaption className="px-5 py-2 text-[0.8rem] text-slate-400">กดที่ภาพเพื่อเปิดภาพเต็ม (PNG)</figcaption>
          </figure>
          <ul className="mt-4 list-disc space-y-1.5 pl-6 text-[0.98rem] leading-relaxed text-slate-300">
            {f.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ))}

      <section id="howto" className="mt-12 scroll-mt-6">
        <h2 className="text-[1.45rem] font-bold">วิธีดูหน้าเว็บ (สำหรับเพื่อนๆ)</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {HOWTO.map(([t, d]) => (
            <div key={t} className="glass rounded-2xl px-5 py-4">
              <dt className="font-bold text-cyan-100">{t}</dt>
              <dd className="mt-1 text-[0.95rem] leading-relaxed text-slate-300">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="mcp" className="mt-12 scroll-mt-6">
        <h2 className="text-[1.45rem] font-bold">เชื่อม AI ผ่าน MCP (สำหรับนักพัฒนา)</h2>
        <p className="mt-3 text-[0.98rem] leading-relaxed text-slate-300">
          ปลายทาง <code className="text-cyan-200">{SITE}/api/mcp</code> (HTTP, JSON-RPC) ยืนยันตัวด้วยหัว <code className="text-cyan-200">Authorization: Bearer &lt;token&gt;</code> ขอ token จากผู้ดูแล มีคำสั่ง 7 ตัว:
        </p>
        <div className="glass mt-3 overflow-x-auto rounded-2xl">
          <table className="w-full text-left text-[0.92rem]">
            <tbody className="divide-y divide-white/[0.06]">
              {[
                ["status", "สุขภาพระบบ ค่าตั้ง จำนวนสคริปต์ รอบที่กำลังรัน"],
                ["scripts", "รายการสคริปต์ หรืออ่านไฟล์สคริปต์ตาม id"],
                ["save_script", "เพิ่ม/แก้สคริปต์ (ตรวจรูปแบบก่อนบันทึก)"],
                ["run", "สั่งรันตามสคริปต์ / บอท / โมดูล / ทั้งหมด หรือตามเลข issue แล้วรอผล"],
                ["runs", "ดูรอบการรัน ผลละเอียด หยุด หรือส่งเข้า IssueMate"],
                ["events", "ฟีดเหตุการณ์แบบรอได้ (long-poll)"],
                ["notify", "ส่งข้อความขึ้นหน้าเว็บ"],
              ].map(([t, d]) => (
                <tr key={t}>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-cyan-200">{t}</td>
                  <td className="px-4 py-2 text-slate-300">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="faq" className="mt-12 scroll-mt-6">
        <h2 className="text-[1.45rem] font-bold">คำถามที่พบบ่อย</h2>
        <div className="mt-4 space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="glass rounded-2xl px-5 py-3">
              <summary className="cursor-pointer font-bold text-slate-100">{q}</summary>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-slate-300">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="mt-14 border-t border-white/[0.07] pt-5 text-[0.8rem] text-slate-500">ภาพ Workflow สร้างจาก docs/workflow/*.html · อ้างอิงโค้ดจริงใน src/lib และ runner/run.mjs</footer>
    </main>
  );
}
