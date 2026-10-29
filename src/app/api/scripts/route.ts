import { guard, ok } from "@/lib/api";
import { loadScripts } from "@/lib/uat-scripts";

export const GET = () =>
  guard(() => {
    const { scripts, errors } = loadScripts();
    return ok({ scripts: scripts.map(({ file: _file, ...s }) => s), errors });
  });
