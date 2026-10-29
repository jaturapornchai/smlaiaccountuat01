// วาดลูกศรโค้งระหว่างกล่อง: window.ARROWS = [[จาก id, ไป id, ข้อความ, { color, dash, both, from, to }]]
// from/to = ด้านที่ออก/เข้า (l r t b) ไม่ใส่ = เลือกเองตามทิศ · x1/y1 = เลื่อนจุดออก · dx/dy = เลื่อนป้าย
const DIR = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };

function side(a, b) {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "r" : "l") : dy > 0 ? "b" : "t";
}
const flip = { l: "r", r: "l", t: "b", b: "t" };
const point = (r, s) => ({ l: [r.left, r.top + r.height / 2], r: [r.right, r.top + r.height / 2], t: [r.left + r.width / 2, r.top], b: [r.left + r.width / 2, r.bottom] })[s];

function drawArrows() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("arrows");
  svg.setAttribute("width", document.body.scrollWidth);
  svg.setAttribute("height", document.body.scrollHeight);
  let defs = "";
  for (const [k, [from, to, label, o = {}]] of window.ARROWS.entries()) {
    const color = o.color ?? "#22d3ee";
    const a = document.getElementById(from).getBoundingClientRect();
    const b = document.getElementById(to).getBoundingClientRect();
    const s1 = o.from ?? side(a, b);
    const s2 = o.to ?? flip[side(a, b)];
    const [x1, y1] = point(a, s1).map((v, i) => v + ((i ? o.y1 : o.x1) ?? 0)); // x1/y1 = เลื่อนจุดออก (px)
    const [x2, y2] = point(b, s2);
    const k1 = Math.max(50, Math.hypot(x2 - x1, y2 - y1) * (o.bend ?? 0.35));
    const c1 = [x1 + DIR[s1][0] * k1, y1 + DIR[s1][1] * k1];
    const c2 = [x2 + DIR[s2][0] * k1, y2 + DIR[s2][1] * k1];
    defs += `<marker id="m${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;
    svg.insertAdjacentHTML(
      "beforeend",
      `<path d="M${x1},${y1} C${c1} ${c2} ${x2},${y2}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" ${o.dash ? 'stroke-dasharray="10 9"' : ""} marker-end="url(#m${k})" ${o.both ? `marker-start="url(#m${k})"` : ""} style="filter:drop-shadow(0 0 6px ${color}88)"/>`,
    );
    if (!label) continue;
    // จุดกึ่งกลางของเส้นโค้ง (t = 0.5) + เลื่อนได้ด้วย o.dx / o.dy
    const mx = (x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8 + (o.dx ?? 0);
    const my = (y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8 + (o.dy ?? 0);
    const el = document.createElement("div");
    el.className = "alabel";
    el.style.cssText = `left:${mx}px;top:${my}px;color:${color}`;
    el.innerHTML = label;
    document.body.appendChild(el);
  }
  svg.insertAdjacentHTML("afterbegin", `<defs>${defs}</defs>`);
  document.body.appendChild(svg);
  document.body.dataset.ready = "1";
}
document.fonts.ready.then(() => requestAnimationFrame(drawArrows));
