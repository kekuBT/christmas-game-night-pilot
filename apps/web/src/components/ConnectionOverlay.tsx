import { useEffect, useState } from "react";
import { MchezoProvider, themes } from "../ui/mchezo/index.js";
import { ConnectionBanner } from "../ui/mchezo/components/ConnectionBanner.js";
import { connection, useConnection } from "../connectionStore.js";

/** Renders this device's connection banner above every screen. */
export function ConnectionOverlay() {
  const { state, droppedAt } = useConnection();
  const [, tick] = useState(0);
  useEffect(() => {
    if (state !== "reconnecting") return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [state]);
  if (state === "online") return null;
  const secondsOffline = droppedAt === null ? 0 : Math.floor((performance.now() - droppedAt) / 1000);
  return (
    <MchezoProvider theme={themes.everyday} as="bare">
      <ConnectionBanner state={state} secondsOffline={secondsOffline} onRetryNow={connection.retryNow} onAcknowledgeReplaced={connection.acknowledge} />
    </MchezoProvider>
  );
}
