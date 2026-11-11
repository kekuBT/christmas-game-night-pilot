import { useState } from "react";
import { SegmentedChoice } from "../ui/mchezo/index.js";
import type { LookPref } from "../ui/mchezo/look.js";

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

/** Stage 8.2 (§3.1): what each look choice does, and that it never changes content. */
const LOOK_HELP: Record<LookPref, string> = {
  auto: "Match the game: Christmas colours when a game deals Christmas content, the everyday colours otherwise.",
  everyday: "Everyday colours on this phone, always.",
  christmas: "Christmas colours on this phone, always.",
};

export function SettingsBar(props: { anim: AnimSetting; onSetAnim: (v: AnimSetting) => void; osReducedMotion?: boolean; look?: LookPref; onSetLook?: (v: LookPref) => void; lookSaved?: boolean }) {
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
      {props.look && props.onSetLook && (
        <div className="mz-settings__row">
          <span className="mz-settings__label" id="mz-look-label">Look</span>
          <SegmentedChoice
            label="Look"
            compact
            value={props.look}
            onChange={(v) => props.onSetLook?.(v as LookPref)}
            options={[
              { value: "auto", title: "Match", testId: "look-auto", tone: "neutral" },
              { value: "everyday", title: "Everyday", testId: "look-everyday", tone: "neutral" },
              { value: "christmas", title: "Christmas", testId: "look-christmas", tone: "neutral" },
            ]}
          />
          <p className="mz-foot" style={{ margin: 0, textAlign: "left" }} data-testid="look-help">
            {LOOK_HELP[props.look]} Only this phone changes: it never changes what anyone is dealt.
          </p>
          {props.lookSaved === false && <p className="mz-foot" role="status" style={{ margin: 0, textAlign: "left" }} data-testid="look-unsaved">This phone can’t save settings right now, so this look applies until you reload this page.</p>}
        </div>
      )}
      <div className="mz-settings__row">
        <span className="mz-settings__label">Sound</span>
        <p className="mz-foot" style={{ margin: 0, textAlign: "left" }} data-testid="sound-status">Mchezo doesn’t play any sounds yet.</p>
      </div>
    </section>
  );
}
