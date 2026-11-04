// Injected into pages by the Playwright harness. Returns layout + contrast findings.
window.__mzAudit = function () {
  const vw = innerWidth, vh = innerHeight;
  const out = { docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, vw, vh, offRight: [], clipped: [], contrast: [], small: [] };
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = (el) => {
    const stack = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
    }
    let acc = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) acc = blend(stack[i], acc);
    return acc;
  };
  const opacityOf = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const label = (el) => (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : el.tagName) + ' "' + (el.textContent || '').trim().slice(0, 28) + '"';
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode; if (!t.textContent.trim()) continue;
    const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || el.closest('[aria-hidden="true"]') && el.closest('.mz-hero')) continue;
    const op = opacityOf(el);
    if (op < 0.5) continue; // intentionally de-emphasised / transitioning
    if (r.right > vw + 1 || r.left < -1) out.offRight.push(label(el) + ` [${Math.round(r.left)}..${Math.round(r.right)}]`);
    const fs = parseFloat(cs.fontSize);
    if (fs < 13 && !el.closest('.mz-tv')) out.small.push(label(el) + ' ' + fs + 'px');
    if (el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && cs.overflow !== 'visible' && el.clientWidth > 0) out.clipped.push(label(el));
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el); const f = blend({ ...fg, a: fg.a * op }, bg);
    const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const large = fs >= 24 || (fs >= 18.66 && Number(cs.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) out.contrast.push(label(el) + ` ${ratio.toFixed(2)} (need ${need})`);
  }
  return out;
};
