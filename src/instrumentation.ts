// Next.js เรียกครั้งเดียวตอนเซิร์ฟเวอร์เริ่ม → ลง log ทุกครั้งที่รีสตาร์ท (deploy / OOM / ล่ม) ไว้ไล่ย้อนหลัง
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { writeLog } = await import("./lib/log");
  writeLog("server", { event: "start", pid: process.pid, node: process.version });
}
