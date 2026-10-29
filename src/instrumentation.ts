// Next.js เรียกครั้งเดียวตอนเซิร์ฟเวอร์เริ่ม → ลง log ทุกครั้งที่รีสตาร์ท (deploy / OOM / ล่ม) ไว้ไล่ย้อนหลัง
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { writeLog } = await import("./lib/log");
  writeLog("server", { event: "start", pid: process.pid, node: process.version });
  // systemd stop ส่ง SIGTERM แต่ Next รอคำขอที่ค้าง (MCP run wait / events รอได้หลายนาที) จนโดน SIGKILL หลัง 90 วิทุกครั้ง (journal 2026-10-29)
  // ให้ Next ปิดเอง 5 วิ ไม่ทันก็ออกเลย · คิวรันอยู่ในหน่วยความจำ หายตอนรีสตาร์ทอยู่แล้ว (deploy รอคิวว่างก่อน)
  process.once("SIGTERM", () => {
    writeLog("server", { event: "stop", pid: process.pid });
    setTimeout(() => process.exit(0), 5000).unref();
  });

  // ticket ที่ Tester เปิดเป็น deployed → ตรวจซ้ำเอง (สวิตช์ autoRetest) · IssueMate ไม่มี webhook จึงถามทุก 5 นาที
  const [{ join }, { pollDeployed }, { listDeployed }, { startRuns, RUN_DIR }, { getSettings }, { pushActivity }] = await Promise.all([
    import("node:path"), import("./lib/auto-retest"), import("./lib/issuemate"), import("./lib/uat-runs"), import("./lib/swarm-store"), import("./lib/activity"),
  ]);
  const deps = {
    list: listDeployed,
    start: startRuns,
    stateFile: join(RUN_DIR, "auto-retest.json"),
    note: (text: string, code: string, scriptId: string) => void pushActivity({ kind: "note", text, code, scriptId }),
  };
  setInterval(() => {
    if (getSettings().autoRetest) pollDeployed(deps).catch((e) => writeLog("server", { event: "auto-retest", error: String(e) }));
  }, 5 * 60_000).unref();
}
