import { bad, guard, ok } from "@/lib/api";
import { dispatch } from "@/lib/command";
import { BroadcastRequest } from "@/types/bot";

// สั่งงานตรวจ: ไม่ระบุ targetBotIds = ให้ AI เลือกบอทที่เกี่ยวข้องเอง แล้วแต่ละบอทเขียนสคริปต์และรันจริง
export const POST = (req: Request) =>
  guard(async () => {
    const { targetBotIds, prompt }: BroadcastRequest = await req.json();
    if (typeof prompt !== "string" || !prompt.trim()) return bad("กรุณาพิมพ์คำสั่งว่าจะให้ตรวจอะไร");
    const bots = await dispatch(prompt.trim(), targetBotIds);
    const sent = bots.filter((b) => b.taskHistory[0]?.status === "completed").length;
    return ok({ message: `กระจายงานให้ ${bots.length} บอท · เขียนสคริปต์และเข้าคิวรันจริง ${sent} ตัว`, dispatchedCount: sent, failedCount: bots.length - sent, bots });
  });
