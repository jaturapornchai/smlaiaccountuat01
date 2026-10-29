// Next.js เรียกครั้งเดียวตอนเซิร์ฟเวอร์เริ่ม → ลง log ทุกครั้งที่รีสตาร์ท (deploy / OOM / ล่ม) ไว้ไล่ย้อนหลัง
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { writeLog } = await import("./lib/log");
  writeLog("server", { event: "start", pid: process.pid, node: process.version });
  // ตัวตั้งเวลารอบ regression กลางคืน (ปิดอยู่จนกว่าเปิดที่หน้าตั้งค่า) — nightly-run.ts
  (await import("./lib/nightly-run")).startNightly();
  // systemd stop ส่ง SIGTERM แต่ Next รอคำขอที่ค้าง (MCP run wait / events รอได้หลายนาที) จนโดน SIGKILL หลัง 90 วิทุกครั้ง (journal 2026-10-29)
  // ให้ Next ปิดเอง 5 วิ ไม่ทันก็ออกเลย · คิวรันอยู่ในหน่วยความจำ หายตอนรีสตาร์ทอยู่แล้ว (deploy รอคิวว่างก่อน)
  process.once("SIGTERM", () => {
    writeLog("server", { event: "stop", pid: process.pid });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
