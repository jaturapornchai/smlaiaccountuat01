import React from "react";
import { BotConfig, Lens } from "@/types/bot";

// วงโคจร 3 วง = 3 มุมตรวจ, จุดละ 1 บอท สีตามโมดูล — บอทที่กำลังรันเรืองแสงและมีเส้นต่อเข้าแกนกลาง
const RINGS: { lens: Lens; r: number; dur: number; reverse?: boolean }[] = [
  { lens: "screen", r: 92, dur: 70 },
  { lens: "data", r: 132, dur: 95, reverse: true },
  { lens: "api", r: 172, dur: 130 },
];

export const SwarmCore: React.FC<{ bots: BotConfig[] }> = ({ bots }) => {
  const running = bots.filter((b) => b.status === "running").length;
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" role="img" aria-label={`แผนภาพฝูงบอท ${bots.length} ตัว กำลังรัน ${running} ตัว`}>
      <defs>
        <radialGradient id="core" cx="50%" cy="40%">
          <stop offset="0" stopColor="#a5f3fc" />
          <stop offset="0.45" stopColor="#6366f1" />
          <stop offset="1" stopColor="#1e1b4b" />
        </radialGradient>
        <radialGradient id="halo">
          <stop offset="0" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="200" cy="200" r="190" fill="url(#halo)" className="breathe" />
      {RINGS.map(({ lens, r, dur, reverse }) => {
        const ring = bots.filter((b) => b.lens === lens);
        return (
          <g key={lens}>
            <circle cx="200" cy="200" r={r} fill="none" stroke="rgba(148,163,255,0.16)" strokeDasharray="2 6" />
            <g className="orbit" style={{ animationDuration: `${dur}s`, animationDirection: reverse ? "reverse" : "normal" }}>
              {ring.map((b, k) => {
                const a = (k / ring.length) * Math.PI * 2 + r / 40;
                const x = 200 + r * Math.cos(a);
                const y = 200 + r * Math.sin(a);
                const live = b.status === "running";
                const bad = b.status === "error" || b.taskHistory[0]?.result?.startsWith("ไม่ผ่าน");
                return (
                  <g key={b.id}>
                    {live && <line x1="200" y1="200" x2={x} y2={y} stroke={b.accent} strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="4 5" />}
                    {bad && <circle cx={x} cy={y} r="10" fill="none" stroke="#fb7185" strokeOpacity="0.7" />}
                    <circle cx={x} cy={y} r={live ? 7 : 4.5} fill={b.accent} filter={live ? "url(#glow)" : undefined} opacity={b.status === "idle" ? 0.75 : 1}>
                      <title>{`#${b.number} ${b.name}`}</title>
                    </circle>
                  </g>
                );
              })}
            </g>
          </g>
        );
      })}
      <circle cx="200" cy="200" r="46" fill="url(#core)" filter="url(#glow)" className="breathe" />
      <text x="200" y="196" textAnchor="middle" fontSize="20" fontWeight="800" fill="#fff">UAT</text>
      <text x="200" y="217" textAnchor="middle" fontSize="11" fill="#c7d2fe">{running ? `รัน ${running} ตัว` : `${bots.length} บอท`}</text>
    </svg>
  );
};
