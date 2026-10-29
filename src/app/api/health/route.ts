import { guard, ok } from "@/lib/api";
import { checkAll } from "@/lib/uat-health";

export const GET = () => guard(async () => ok(await checkAll()));
