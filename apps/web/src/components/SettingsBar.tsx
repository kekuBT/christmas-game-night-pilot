import { useState } from "react";
import { SegmentedChoice } from "../ui/mchezo/index.js";

export type AnimSetting = "full" | "reduced" | "off";

/**
 * Per-player experience settings (M6.2), local to this device. Animation
 * intensity is real and applies on every screen (App passes it to every
 * MchezoProvider). Sound: Mchezo plays no sounds yet, so there is no sound
 * switch — a toggle that changes nothing would mislead (audit F7). The stored
 * `cgn_sound` value is left alone for when audio exists.
 */
export function useExperienceSettings() {
  const [anim, setAnim] = useState<AnimSetting>(() => {
    try {
      const v = localStorage.getItem("cgn_anim");
      return v === "reduced" || v === "off" ? v : "full";
    } catch { return "full"; }
  });
  function setAnimSetting(v: AnimSetting) {
    setAnim(v);
    try { localStorage.setItem("cgn_anim", v); } catch { /* storage unavailable */ }
  }
  return { anim, setAnimSetting };
}

const ANIM_HELP: Record<AnimSetting, string> = {
  full: "Full motion: arrivals, reveals and celebrations animate.",
  reduced: "Less motion: short fades instead of movement.",
  off: "No motion: nothing animates.",
};

export function SettingsBar(props: { anim: AnimSetting; onSetAnim: (v: AnimSetting) => void; osReducedMotion?: boolean }) {
  return (
    <section className="mz-card" style={{ marginTop: 12 }} data-testid="settings-bar" aria-labelledby="mz-settings-title">
      <span className="mz-kicker" id="mz-settings-title">This phone</span>
      <div className="mz-settings__row">
        <span className="mz-settings__label" id="mz-motion-label">Animations</span>
        <SegmentedChoice
          label="Animations"
          compact
          value={props.anim}
          onChange={(v) => props.onSetAnim(v as AnimSetting)}
          options={[
            { value: "full", title: "Full", testId: "motion-full", tone: "neutral" },
            { value: "reduced", title: "Less", testId: "motion-reduced", tone: "neutral" },
            { value: "off", title: "Off", testId: "motion-off", tone: "neutral" },
          ]}
        />
        <p className="mz-foot" style={{ margin: 0, textAlign: "left" }} data-testid="motion-help">
          {props.osReducedMotion && props.anim === "full" ? "Your phone is set to reduce motion, so Mchezo uses short fades. " : ""}
          {ANIM_HELP[props.anim]} Nothing important depends on animation.
        </p>
      </div>
      <div className="mz-settings__row">
        <span className="mz-settings__label">Sound</span>
        <p className="mz-foot" style={{ margin: 0, textAlign: "left" }} data-testid="sound-status">Mchezo doesn’t play any sounds yet.</p>
      </div>
    </section>
  );
}
