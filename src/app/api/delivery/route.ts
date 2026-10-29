import { guard, ok } from "@/lib/api";
import { buildDelivery } from "@/lib/delivery";

// สรุปผลล่าสุดต่อเมนู/รายงาน/สคริปต์ตรวจ + คำตัดสินส่งมอบ
export const GET = () => guard(() => ok(buildDelivery()));
