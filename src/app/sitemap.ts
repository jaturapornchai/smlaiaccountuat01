import type { MetadataRoute } from "next";

// มีแค่หน้าคู่มือที่เปิดให้ค้นเจอ
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://uat.smlwork.com/guide", changeFrequency: "monthly", priority: 1 }];
}
