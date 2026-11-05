// Sit-out control (Milestone J.3 primitive) — the shared abstain
// button and abstained note, verbatim from the old panel. Every
// non-Charades game shows this same button and note, so one component
// serves all of them as they migrate; Charades (no abstention) never
// uses it.
import { Keycap } from "./primitives.js";

export function AbstainControl({ abstained, onAbstain }: { abstained: boolean; onAbstain: () => void }) {
  if (abstained) {
    return <p className="mz-foot">You sat this one out — 0 points for what you skipped. The game continues for everyone else.</p>;
  }
  return <Keycap block variant="neutral" data-testid="mz-abstain" onClick={onAbstain}>Sit out (abstain)</Keycap>;
}
