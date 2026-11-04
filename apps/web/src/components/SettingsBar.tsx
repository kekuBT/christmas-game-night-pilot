import { useState } from "react";

export type AnimSetting = "full" | "reduced" | "off";

/** Per-player experience settings (M6.2): sound off by default, animation intensity. Local only. */
export function useExperienceSettings() {
  const [sound, setSound] = useState(() => localStorage.getItem("cgn_sound") === "on");
  const [anim, setAnim] = useState<AnimSetting>(() => (localStorage.getItem("cgn_anim") as AnimSetting) || "full");
  function toggleSound() {
    const next = !sound;
    setSound(next);
    localStorage.setItem("cgn_sound", next ? "on" : "off");
  }
  function setAnimSetting(v: AnimSetting) {
    setAnim(v);
    localStorage.setItem("cgn_anim", v);
  }
  return { sound, anim, toggleSound, setAnimSetting };
}

export function SettingsBar(props: { sound: boolean; anim: AnimSetting; onToggleSound: () => void; onSetAnim: (v: AnimSetting) => void }) {
  return <div className="card settings-bar" data-testid="settings-bar">
    <label><input type="checkbox" checked={props.sound} onChange={props.onToggleSound} /> Sound effects (off by default)</label>
    <label>Animations
      <select value={props.anim} onChange={(e) => props.onSetAnim(e.target.value as AnimSetting)}>
        <option value="full">Full</option>
        <option value="reduced">Reduced</option>
        <option value="off">Off</option>
      </select>
    </label>
    <p className="muted">Reduced motion in your device settings also reduces animations here. Nothing important depends on animation.</p>
  </div>;
}
