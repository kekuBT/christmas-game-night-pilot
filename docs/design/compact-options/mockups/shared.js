// Compact UI options (handoff 7060711859): which screen, look and variant a mockup page shows.
//   ?screen=home|lobby|picker|results|desktop-lobby|desktop-results|tv-lobby|tv-results
//   &look=everyday|christmas   &variant=long (long names) | help (error and help copy)
//   &code=&p2=&p3=&ka= (optional): the captured room code, 2nd and 3rd place names and Keku's answers.
// Static design artifacts only: no network, no storage, nothing from the app.
(function () {
  const q = new URLSearchParams(location.search);
  const screen = q.get("screen") || "home";
  const look = q.get("look") === "christmas" ? "christmas" : "everyday";
  const variant = q.get("variant") || "";
  document.documentElement.dataset.look = look;
  document.documentElement.dataset.variant = variant;
  for (const s of document.querySelectorAll("[data-screen]")) s.hidden = s.dataset.screen !== screen;
  document.title = `${document.title} · ${screen} · ${look}${variant ? ` · ${variant}` : ""}`;

  // Content (render.mjs --content): the room code and the order the captured match actually produced, so the
  // options show exactly what the "before" screenshots show. Defaults: the content these mockups were drawn with.
  const P = { code: q.get("code") || "3QC2UZ", p2: q.get("p2") || "Amina", p3: q.get("p3") || "Baraka", ka: q.get("ka") || "2" };
  const COLOR = { Amina: "#7FE0CC", Baraka: "#FFD670" };
  for (const el of document.querySelectorAll("[data-slot]")) {
    const k = el.dataset.slot;
    if (k === "code") el.textContent = P.code;
    else if (k === "ka") el.textContent = `${P.ka} ${P.ka === "1" ? "answer" : "answers"}`;
    else { el.textContent = el.textContent.replace(/Amina|Baraka/, P[k]); el.dataset.name = P[k]; }
  }
  for (const el of document.querySelectorAll("[data-avatar]")) { const n = P[el.dataset.avatar]; el.textContent = n[0]; if (COLOR[n]) el.style.background = COLOR[n]; }
  for (const el of document.querySelectorAll("[data-aria-code]")) el.setAttribute("aria-label", el.getAttribute("aria-label").replace(/[A-Z0-9]{6}$/, P.code));

  // The circle-and-dots mark, drawn as the app draws it (CircleMark): eight seats, the first larger, in brand colour.
  const css = getComputedStyle(document.documentElement);
  for (const el of document.querySelectorAll("[data-mark]")) {
    const size = Number(el.dataset.mark) || 28;
    const brand = css.getPropertyValue("--brand").trim();
    const text = css.getPropertyValue("--text").trim();
    let dots = "";
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 8;
      dots += `<circle cx="${(20 + Math.cos(a) * 14).toFixed(2)}" cy="${(20 + Math.sin(a) * 14).toFixed(2)}" r="${k === 0 ? 5 : 3}" fill="${k === 0 ? brand : text}"/>`;
    }
    el.outerHTML = `<svg class="mark" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 40 40">${dots}</svg>`;
  }

  // Long names: the same screens with the longest names a family might type (the app allows 24 characters).
  if (variant === "long") {
    const long = { Keku: "Keku Mwangi-Habtemariam", Amina: "Amina-Josephine Wanjiku", Baraka: "Baraka Omondi Ochieng" };
    for (const el of document.querySelectorAll("[data-name]")) {
      const n = el.dataset.name;
      // A podium (Option B) shows first names only; the full name is in the list under it.
      if (long[n]) el.textContent = el.textContent.replace(n, "dataset" in el && "first" in el.dataset ? long[n].split(" ")[0] : long[n]);
    }
    for (const el of document.querySelectorAll("[data-room-name]")) el.textContent = "Wanjiku family Christmas Eve";
  }
  // Help: the error and help copy each screen can show, all at once (each would appear on its own).
  for (const el of document.querySelectorAll("[data-help]")) el.hidden = variant !== "help";
})();
