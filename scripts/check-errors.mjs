// Work Package F: server rejections must reach the player as human
// sentences, never as raw codes or terse server text — and the kit lobby
// must actually show them (they used to sit at the very bottom of the
// lobby's extra section, below the fold on a phone).
//
// Checks (all against the live app + server, no mocks):
//  1. Joining with a taken display name shows "That name is taken in
//     this room — pick another." on the landing, never the raw
//     "Display name already taken".
//  2. A failed reconnect (bad recovery token) shows "We could not bring
//     you back into your seat — rejoin with the room code." at the top
//     of the kit lobby, never "Unknown player slot" / "Recovery token
//     does not match".
//  3. A successful reconnect afterwards clears the error and confirms.
import { launchChromium } from "./lib/driver-env.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
}

const browser = await launchChromium({ headless: true });
try {
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await hostCtx.newPage();
  await host.goto(BASE, { waitUntil: "domcontentloaded" });
  await host.getByPlaceholder("e.g. Auntie June").fill("Ada");
  await host.getByRole("button", { name: "Host a game" }).click();
  const shareChip = host.getByRole("button", { name: /^Share room code / });
  await shareChip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await shareChip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(500);
  }
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error(`unexpected room code: ${code}`);
  await host.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });

  // 1. Duplicate display name: the landing must show the human sentence.
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const guest = await guestCtx.newPage();
  await guest.goto(BASE, { waitUntil: "domcontentloaded" });
  await guest.getByPlaceholder("e.g. Auntie June").fill("Ada");
  await guest.locator(".mz-code__input").fill(code);
  await guest.getByRole("button", { name: "Join the game" }).click();
  const landingErr = guest.getByTestId("mz-error");
  await landingErr.waitFor({ timeout: 15000 });
  const landingText = await landingErr.innerText();
  check("duplicate name shows the human sentence on the landing", landingText.includes("That name is taken in this room — pick another."));
  const landingBody = await guest.evaluate(() => document.body.innerText);
  check("duplicate name shows no raw server sentence", !landingBody.includes("Display name already taken"));

  // Join cleanly as Bea; the lobby is where the second check happens.
  await guest.getByPlaceholder("e.g. Auntie June").fill("Bea");
  await guest.getByRole("button", { name: "Join the game" }).click();
  await guest.getByRole("heading", { name: "You’re in, Bea." }).waitFor({ timeout: 15000 });

  // 2. Bad recovery token + Reconnect: the lobby must show the human
  // seat sentence at the top, never the raw server reason.
  // NOTE: reconnect() sends the token from React state, which is read
  // from sessionStorage only at mount — so corrupting sessionStorage
  // alone changes only the header, not the validated credential. Reload
  // after corrupting so the mounted state holds the bad token (this is
  // also the realistic failure mode: a stale token after a reload).
  const goodToken = await guest.evaluate(() => sessionStorage.getItem("cgn_token"));
  if (!goodToken) throw new Error("guest sessionStorage has no cgn_token");
  await guest.evaluate(() => sessionStorage.setItem("cgn_token", "bad-token"));
  await guest.reload({ waitUntil: "domcontentloaded" });
  await guest.getByRole("button", { name: "Reconnect" }).waitFor({ timeout: 15000 });
  await guest.getByRole("button", { name: "Reconnect" }).click();
  const lobbyErr = guest.getByTestId("mz-error");
  await lobbyErr.waitFor({ timeout: 15000 });
  const lobbyText = await lobbyErr.innerText();
  check("bad-token reconnect shows the human seat sentence in the lobby", lobbyText.includes("We could not bring you back into your seat — rejoin with the room code."));
  const lobbyBody = await guest.evaluate(() => document.body.innerText);
  check("bad-token reconnect shows no raw server reason", !lobbyBody.includes("Unknown player slot") && !lobbyBody.includes("Recovery token does not match"));

  // 3. Restoring the token and reconnecting clears the error. The
  // mounted state still holds the bad token, so reload after restoring.
  await guest.evaluate((t) => sessionStorage.setItem("cgn_token", t), goodToken);
  await guest.reload({ waitUntil: "domcontentloaded" });
  await guest.getByRole("button", { name: "Reconnect" }).waitFor({ timeout: 15000 });
  await guest.getByRole("button", { name: "Reconnect" }).click();
  await guest.getByText("Reconnected to your player slot.").waitFor({ timeout: 15000 });
  check("successful reconnect clears the lobby error", (await guest.getByTestId("mz-error").count()) === 0);
} finally {
  await browser.close();
}
console.log(failures === 0 ? "ERRORS ALL PASSED" : `ERRORS FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
