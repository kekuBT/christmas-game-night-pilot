import { useEffect, useState } from "react";
import { MchezoProvider, themes } from "../ui/mchezo/index.js";
import { ConnectionBanner } from "../ui/mchezo/components/ConnectionBanner.js";
import { connection, roomNotices, useConnection, useRoomNotices } from "../connectionStore.js";

/** One room notice at a time (e.g. "Ada restored Bea's seat on a new device"), dismissable, auto-hides. */
function NoticeToast() {
  const queue = useRoomNotices();
  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => roomNotices.dismiss(current.id), 9000);
    return () => clearTimeout(t);
  }, [current]);
  if (!current) return null;
  return (
    <div className="mz-notice" role="status" aria-live="polite" data-testid="mz-room-notice">
      <span className="mz-notice__text">{current.text}</span>
      <button type="button" className="mz-notice__close" aria-label="Dismiss" onClick={() => roomNotices.dismiss(current.id)}>×</button>
    </div>
  );
}

/** Renders this device's connection banner and room notices above every screen. */
export function ConnectionOverlay() {
  return (
    <MchezoProvider theme={themes.everyday} as="bare">
      <ConnectionLayer />
      <NoticeToast />
    </MchezoProvider>
  );
}

function ConnectionLayer() {
  const { state, droppedAt } = useConnection();
  const [, tick] = useState(0);
  useEffect(() => {
    if (state !== "reconnecting") return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [state]);
  if (state === "online") return null;
  const secondsOffline = droppedAt === null ? 0 : Math.floor((performance.now() - droppedAt) / 1000);
  return <ConnectionBanner state={state} secondsOffline={secondsOffline} onRetryNow={connection.retryNow} onAcknowledgeReplaced={connection.acknowledge} />;
}
