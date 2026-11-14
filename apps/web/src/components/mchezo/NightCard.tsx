/**
 * Stage 12.6 (docs/stage12/stage126.md): the night card sheet. A picture of the night, made on this phone from the
 * room's public facts (lib/nightCard.ts), shown before anything leaves the phone. "Share" uses the phone's own share
 * sheet where it can share a picture (WhatsApp, Messages…); "Save the picture" always works. Nothing is uploaded.
 */
import { useEffect, useMemo, useState } from "react";
import { Keycap, Sheet, useMchezo } from "../../ui/mchezo/index.js";
import { drawNightCard, NIGHT_CARD_SIZE, type NightCardLook } from "../../ui/mchezo/lib/nightCardDraw.js";
import { nightCardFilename, nightCardText, type NightCardFacts } from "../../ui/mchezo/lib/nightCard.js";

type Status = { kind: "idle" | "ok" | "error"; text: string };

export function NightCardSheet({ facts, cup, onClose }: { facts: NightCardFacts; cup: boolean; onClose: () => void }) {
  const { theme } = useMchezo();
  const christmas = theme.id === "christmas";
  const look: NightCardLook = useMemo(() => ({
    ground: theme.color.ground, surface: theme.color.surface1, line: theme.color.line, text: theme.color.text,
    muted: theme.color.textMuted, accent: theme.color.brand, highlight: theme.color.highlight, onAccent: theme.color.onAccent,
  }), [theme]);
  const [png, setPng] = useState<{ url: string; blob: Blob | null } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });
  const name = useMemo(() => nightCardFilename(new Date(), christmas, cup), [christmas, cup]);
  const key = JSON.stringify(facts);
  useEffect(() => {
    let alive = true;
    const canvas = document.createElement("canvas");
    canvas.width = NIGHT_CARD_SIZE.width; canvas.height = NIGHT_CARD_SIZE.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setStatus({ kind: "error", text: "This browser can’t draw the picture. The facts are listed below." }); return; }
    drawNightCard(ctx, facts, look, christmas);
    const url = canvas.toDataURL("image/png");
    setPng({ url, blob: null });
    canvas.toBlob((blob) => { if (alive) setPng({ url, blob }); }, "image/png");
    return () => { alive = false; };
    // Redrawn when the facts (by value), the look or the title change; `facts` itself is a new object each render.
  }, [key, look, christmas]);
  const file = png?.blob ? new File([png.blob], name, { type: "image/png" }) : null;
  const canShare = !!file && typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  const save = () => {
    if (!png) return;
    const a = document.createElement("a");
    a.href = png.url; a.download = name; a.click();
    setStatus({ kind: "ok", text: `Saved: ${name}. If you don’t see it, check your downloads.` });
  };
  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: facts.title, text: `${facts.title} · ${facts.dateLine}` });
      setStatus({ kind: "ok", text: "Shared." });
    } catch (e) {
      // Closing the share sheet isn't a failure; anything else says so and points to Save.
      if ((e as { name?: string })?.name === "AbortError") setStatus({ kind: "idle", text: "" });
      else setStatus({ kind: "error", text: "Sharing didn’t work on this phone. Save the picture instead, then share it." });
    }
  };
  const text = nightCardText(facts);
  return (
    <Sheet title="Share the night" onClose={onClose} testId="night-card-sheet" kicker="A picture of tonight">
      <p className="mz-details__pitch">Made on this phone from what everyone saw tonight: the games, the results and the medals. Nothing is shared until you choose to.</p>
      <div className="mz-nightcard__frame">
        {png ? <img className="mz-nightcard__img" src={png.url} width={NIGHT_CARD_SIZE.width} height={NIGHT_CARD_SIZE.height} alt={text.replace(/\n/g, ". ")} data-testid="night-card-image" />
          : <p className="mz-foot">Drawing the picture…</p>}
      </div>
      {status.text ? <p className={status.kind === "error" ? "err" : "ok"} role={status.kind === "error" ? "alert" : "status"} data-testid="night-card-status">{status.text}</p> : null}
      <div className="mz-sheet__actions">
        {canShare && <Keycap block onClick={() => void share()} data-testid="night-card-share">Share…</Keycap>}
        <Keycap block variant={canShare ? "surface" : undefined} disabled={!png} onClick={save} data-testid="night-card-save">Save the picture</Keycap>
        <button type="button" className="mz-chip-btn" data-testid="night-card-close" onClick={onClose}>Done</button>
      </div>
      <details className="mz-nightcard__facts">
        <summary>What’s on the card</summary>
        <pre data-testid="night-card-text">{text}</pre>
      </details>
    </Sheet>
  );
}
