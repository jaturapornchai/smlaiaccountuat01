import { after } from "next/server";
import { pushActivity } from "@/lib/activity";
import { bad, guard, ok } from "@/lib/api";
import { dispatch } from "@/lib/command";
import { BroadcastRequest } from "@/types/bot";

// สั่งงานตรวจ: ตอบรับทันที แล้วให้ AI เลือกบอท (ไม่ระบุ targetBotIds) เขียนสคริปต์ และเข้าคิวรันจริงอยู่เบื้องหลัง
// หน้าเว็บไม่ต้องรอ — ผลหรือความผิดพลาดขึ้นฟีดกิจกรรมและลง log ถาวร (pushActivity เขียน log ให้แล้ว)
export const POST = (req: Request) =>
  guard(async () => {
    const { targetBotIds, prompt }: BroadcastRequest = await req.json();
    if (typeof prompt !== "string" || !prompt.trim()) return bad("กรุณาพิมพ์คำสั่งว่าจะให้ตรวจอะไร");
    const cmd = prompt.trim();
    const head = `"${cmd.slice(0, 60)}${cmd.length > 60 ? "…" : ""}"`;
    const note = (status: "sending" | "sent" | "error", text: string) => pushActivity({ kind: "note", client: "ระบบสั่งงาน", status, text });
    note("sending", `รับคำสั่ง ${head} แล้ว — AI กำลังเลือกบอทและเขียนสคริปต์`);
    after(() =>
      dispatch(cmd, targetBotIds).then(
        (bots) => {
          const failed = bots.filter((b) => b.taskHistory[0]?.status !== "completed");
          note(failed.length ? "error" : "sent", `${head} → กระจายให้ ${bots.length} บอท · เข้าคิวรันจริง ${bots.length - failed.length} ตัว${failed.map((b) => `\n✗ ${b.name}: ${b.taskHistory[0]?.result ?? "ไม่ทราบสาเหตุ"}`).join("")}`);
        },
        (e) => note("error", `${head} ทำไม่สำเร็จ: ${(e as Error).message}`),
      ),
    );
    return ok({ message: "รับคำสั่งแล้ว — AI กระจายงานอยู่เบื้องหลัง ผลจะขึ้นในฟีดกิจกรรม" });
  });
