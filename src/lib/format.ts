export const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "-";

export const fmtDur = (ms?: number) => (ms === undefined ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} วิ`);

export const fmtSpan = (from?: string, to?: string) => (from ? fmtDur((to ? Date.parse(to) : Date.now()) - Date.parse(from)) : "");

export function kindLabel(kind: string) {
  if (kind.startsWith("ui.")) return "หน้าจอ";
  if (kind.startsWith("api.")) return "API";
  if (kind === "db.exec") return "SQL เขียน";
  if (kind.startsWith("db.")) return "SQL";
  return kind === "wait" ? "รอ" : "ตัวแปร";
}

export const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

// "3 นาทีที่ผ่านมา" — ใช้กับเวลาทำงานล่าสุดของบอท
const rtf = new Intl.RelativeTimeFormat("th", { numeric: "auto" });
export function fmtAgo(iso?: string | null) {
  if (!iso) return "ยังไม่เคยทำงาน";
  const s = Math.round((Date.parse(iso) - Date.now()) / 1000);
  if (s > -60) return "เมื่อสักครู่";
  if (s > -3600) return rtf.format(Math.round(s / 60), "minute");
  if (s > -86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}
