// Stage 2 (Night Circle): the lobby keeps one primary action on screen and
// moves everything secondary into the room menu (☰), as approved in
// docs/ux-redesign/PROPOSAL.md §4 and §6.11. Drivers reach those places the
// way a person does: open the menu, tap the row. The older full-page views
// (Championship, Memory Book, the TV dashboard, older game panels) still have
// their own header buttons, so this helper uses those when there is no menu.

const MENU = {
  tv: "menu-tv",
  cup: "menu-cup",
  memory: "menu-memory",
  library: "browse-games",
  reconnect: "menu-reconnect",
  studio: "studio-button",
  home: "menu-home",
};
const LEGACY = { tv: "TV Dashboard", cup: "Championship", memory: "Memory Book", reconnect: "Reconnect" };

/** Open the room menu sheet (the lobby's ☰ button). */
export async function openRoomMenu(page, { timeout = 15000 } = {}) {
  if ((await page.getByTestId("room-menu-sheet").count()) > 0) return;
  await page.getByTestId("room-menu").click({ timeout });
  await page.getByTestId("room-menu-sheet").waitFor({ timeout });
}

/** Close the room menu if it is open (Escape, like a keyboard user). */
export async function closeRoomMenu(page) {
  if ((await page.getByTestId("room-menu-sheet").count()) === 0) return;
  await page.keyboard.press("Escape");
  await page.getByTestId("room-menu-sheet").waitFor({ state: "detached", timeout: 5000 });
}

/**
 * Go somewhere in the room: "tv", "cup", "memory", "library", "reconnect",
 * "studio" or "home". From the lobby that is the room menu; from an older
 * full-page view, its header button.
 */
export async function roomGo(page, where, { timeout = 15000 } = {}) {
  if (!(where in MENU)) throw new Error(`roomGo: unknown place ${where}`);
  const legacy = LEGACY[where];
  // Wait until the page shows either the lobby's menu button or the view's own button.
  const menuBtn = page.getByTestId("room-menu");
  await (legacy ? menuBtn.or(page.getByRole("button", { name: legacy, exact: true })) : menuBtn).first().waitFor({ timeout });
  if ((await menuBtn.count()) === 0 && legacy && (await page.getByRole("button", { name: legacy, exact: true }).count()) > 0) {
    await page.getByRole("button", { name: legacy, exact: true }).click({ timeout });
    return;
  }
  await openRoomMenu(page, { timeout });
  await page.getByTestId(MENU[where]).click({ timeout });
}

/** The up-next game's title on the lobby's up-next card. */
export async function upNextTitle(page) {
  const el = page.locator('[data-testid="up-next-card"] .mz-upnext__name');
  if ((await el.count()) === 0) return "";
  return ((await el.first().textContent()) ?? "").trim();
}
