// เรียก API ของแอปเอง — มี body = POST; ถ้าเซิร์ฟเวอร์ตอบไม่สำเร็จจะโยน error พร้อมข้อความไทยจากเซิร์ฟเวอร์
export async function call<T = object>(url: string, body?: object): Promise<T & { message?: string }> {
  const res = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await res.json().catch(() => ({ success: false, message: `เซิร์ฟเวอร์ตอบ HTTP ${res.status}` }));
  if (!res.ok || data.success === false) throw new Error(data.message || `เซิร์ฟเวอร์ตอบ HTTP ${res.status}`);
  return data;
}
