/**
 * Stage 8.3 (docs/stage8/stage83.md §3.2–§3.4): the install guidance, and the
 * calm screens' notices (can't reach Mchezo; a newer version is ready).
 *
 * Shown only on calm screens: Home, the solo shelf, the library, and
 * Settings. Never in a room, a game, a briefing, results, the TV or Watch.
 * No automatic prompting, no forced install, and no success claim the
 * browser didn't make.
 */
import { useState } from "react";
import { Keycap, NoticeCard, Sheet } from "../../ui/mchezo/index.js";
import { installHint, promptInstall, useInstallState, type InstallPath } from "../../install/installState.js";
import { useServerReach } from "../../install/reachability.js";
import { useUpdateReady } from "../../install/registerSw.js";

/** The Share icon iPhone and iPad show (a square with an arrow up), drawn for the steps. */
function ShareGlyph() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" className="mz-install__glyph">
      <path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** How to add Mchezo on this device, in words. */
export function InstallSteps({ path }: { path: InstallPath }) {
  if (path === "ios") {
    return (
      <div className="mz-install__steps" data-testid="install-steps-ios">
        <ol>
          <li>Tap the <strong>Share</strong> button <ShareGlyph /> (in Safari it is at the bottom of an iPhone, at the top of an iPad).</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>. Mchezo appears on your Home Screen.</li>
        </ol>
        <p className="mz-foot mz-install__note">Not every browser on iPhone offers this; Safari does. The Home Screen app keeps its own data: to play in a room you joined here, rejoin it there with the room’s code.</p>
      </div>
    );
  }
  return (
    <div className="mz-install__steps" data-testid="install-steps-menu">
      <p className="mz-foot mz-install__note">Open your browser’s menu and look for <strong>Install app</strong> or <strong>Add to Home screen</strong>. Not every browser offers it.</p>
    </div>
  );
}

/** Home's install card: low emphasis, below the games. */
export function InstallCard() {
  const s = useInstallState();
  const hint = installHint.use();
  const [howOpen, setHowOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (s.standalone) return null;
  if (s.outcome === "installed") {
    return <NoticeCard tone="info" title="Mchezo is added" testId="install-done">Open Mchezo from your Home Screen or app list.</NoticeCard>;
  }
  if (s.outcome === "accepted") {
    return <NoticeCard tone="info" title="Adding Mchezo" testId="install-accepted">Follow your browser to finish adding Mchezo.</NoticeCard>;
  }
  if (s.outcome === "dismissed") {
    // The browser's prompt can be shown once per page: say what is left, claim nothing.
    return <NoticeCard tone="info" title="Not added" testId="install-dismissed">No problem. You can add Mchezo later from your browser’s menu.</NoticeCard>;
  }
  if (hint === "dismissed" || s.path === "menu") return null;
  return (
    <section className="mz-install" aria-labelledby="mz-install-title" data-testid="install-card">
      <h2 className="mz-install__title" id="mz-install-title">Add Mchezo to your Home Screen</h2>
      <p className="mz-install__text">Open it like an app, straight to the games. It still needs a connection to play.</p>
      <div className="mz-install__actions">
        {s.path === "prompt"
          ? <Keycap size="md" variant="surface" data-testid="install-prompt" disabled={busy} onClick={() => { setBusy(true); void promptInstall().finally(() => setBusy(false)); }}>Install Mchezo</Keycap>
          : <Keycap size="md" variant="surface" data-testid="install-how" onClick={() => setHowOpen(true)}>Show me how</Keycap>}
        <button type="button" className="mz-linkbtn" data-testid="install-not-now" onClick={() => installHint.set("dismissed")}>Not now</button>
      </div>
      {howOpen && (
        <Sheet title="Add Mchezo to your Home Screen" onClose={() => setHowOpen(false)} testId="install-sheet">
          <InstallSteps path={s.path} />
        </Sheet>
      )}
    </section>
  );
}

/** Settings → Add to Home Screen: always there (unless installed), whatever the Home card's state. */
export function InstallSettingsRow() {
  const s = useInstallState();
  const [busy, setBusy] = useState(false);
  return (
    <div className="mz-settings__row" data-testid="install-settings">
      <span className="mz-settings__label">Add to Home Screen</span>
      {s.standalone
        ? <p className="mz-foot" style={{ margin: 0, textAlign: "left" }} data-testid="install-settings-standalone">You’re using Mchezo from your Home Screen.</p>
        : s.outcome === "installed"
          ? <p className="mz-foot" style={{ margin: 0, textAlign: "left" }}>Mchezo is added. Open it from your Home Screen or app list.</p>
          : s.path === "prompt"
            ? <Keycap size="md" variant="surface" data-testid="install-settings-prompt" disabled={busy} onClick={() => { setBusy(true); void promptInstall().finally(() => setBusy(false)); }}>Install Mchezo</Keycap>
            : <InstallSteps path={s.path} />}
    </div>
  );
}

/**
 * The calm screens' notices: the game server can't be reached (with Try
 * again), and a newer version is ready (Reload this tab, or Later).
 */
export function CalmNotices() {
  const { reach, retry } = useServerReach();
  const update = useUpdateReady();
  const [later, setLater] = useState(false);
  return (
    <>
      {reach === "unreachable" && (
        <NoticeCard tone="warn" title="Can’t reach Mchezo" testId="offline-notice"
          action={<Keycap size="md" variant="surface" data-testid="offline-retry" onClick={retry}>Try again</Keycap>}>
          Every game, solo rounds included, runs on Mchezo’s game server, and this device can’t reach it right now. Check your connection, then try again. Nothing has started.
        </NoticeCard>
      )}
      {update && !later && (
        <NoticeCard tone="info" title="A newer version of Mchezo is ready" testId="update-notice"
          action={<>
            <Keycap size="md" variant="surface" data-testid="update-reload" onClick={() => location.reload()}>Reload</Keycap>
            <button type="button" className="mz-linkbtn" data-testid="update-later" onClick={() => setLater(true)}>Later</button>
          </>}>
          Reload to use it. Your seat, your bests and your choices stay on this device.
        </NoticeCard>
      )}
    </>
  );
}
