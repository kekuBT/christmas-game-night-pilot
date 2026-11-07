/**
 * Stage 1 (owner-approved, 2026-11-07): the room-code Share control opens this
 * sheet. It shows the QR code and code, offers the phone's native Share sheet
 * where the browser has one, and always offers Copy link, with visible
 * feedback. If copying is impossible (an http:// home-network address has no
 * clipboard access), the link is shown selectable instead.
 *
 * Honesty about reach: a private Codespaces preview address only opens for the
 * owner's signed-in GitHub account, and a localhost address only on this
 * device. The sheet says so instead of implying anyone can join.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LinkReach } from "../lib/share.js";

export function InviteSheet({ code, url, qrDataUrl, reach, onClose }: {
  code: string;
  url: string;
  qrDataUrl?: string;
  reach: LinkReach;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [showLink, setShowLink] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareText = `Join my Mchezo room with code ${code}.`;

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(url);
      setStatus({ tone: "ok", text: "Link copied. Paste it in your group chat." });
    } catch {
      setShowLink(true);
      setStatus({ tone: "warn", text: "Couldn’t copy automatically on this connection. Press and hold the link below to copy it, or share the code." });
    }
  }
  async function share() {
    try {
      await navigator.share({ title: "Join my Mchezo room", text: shareText, url });
      setStatus({ tone: "ok", text: "Shared." });
    } catch (e) {
      // The person closed the share sheet: nothing to report.
      if (e instanceof DOMException && e.name === "AbortError") return;
      await copy();
    }
  }

  return (
    <div className="mz-sheet-layer" data-testid="invite-sheet">
      <div className="mz-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <section className="mz-sheet" role="dialog" aria-modal="true" aria-labelledby="mz-invite-title">
        <div className="mz-sheet__grab" aria-hidden="true" />
        <h2 className="mz-sheet__title" id="mz-invite-title" tabIndex={-1} ref={titleRef}>Invite players</h2>
        {reach !== "public" && (
          <p className="mz-noticecard mz-noticecard--warn mz-noticecard__text" data-testid="invite-reach-note" role="note">
            {reach === "private-preview"
              ? <><b>Private preview link.</b> This address only opens for the GitHub account that runs this preview. Other people can’t join from it.</>
              : <><b>This link only works on this device</b> (it points to localhost). Open Mchezo from your computer’s Wi-Fi address to invite phones.</>}
          </p>
        )}
        {qrDataUrl && <img className="mz-invite__qr" src={qrDataUrl} alt={`QR code to join room ${code}`} width={176} height={176} />}
        <p className="mz-invite__code" aria-label={`Room code ${code.split("").join(" ")}`}>{code}</p>
        <p className="mz-foot" style={{ marginTop: 2 }}>Scan the code, or open Mchezo and type the code.</p>
        {showLink && <p className="mz-invite__link" data-testid="invite-link">{url}</p>}
        <div className="mz-sheet__actions">
          {canShare && <button type="button" className="mz-key mz-key--brand mz-key--md" data-testid="invite-share" onClick={() => void share()}>Share…</button>}
          <button type="button" className={`mz-key ${canShare ? "mz-key--surface" : "mz-key--brand"} mz-key--md`} data-testid="invite-copy" onClick={() => void copy()}>Copy link</button>
        </div>
        <p className={`mz-invite__status${status ? ` mz-invite__status--${status.tone}` : ""}`} role="status" aria-live="polite" data-testid="invite-status">{status?.text ?? ""}</p>
        <button type="button" className="mz-linkbtn" style={{ alignSelf: "center" }} data-testid="invite-close" onClick={onClose}>Done</button>
      </section>
    </div>
  );
}

/** A small confirmation for a one-way action. Inline, not a browser dialog. */
export function ConfirmPanel({ title, children, confirmLabel, cancelLabel = "Not yet", onConfirm, onCancel, testId }: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="mz-confirm" role="alertdialog" aria-labelledby="mz-confirm-title" data-testid={testId}>
      <p className="mz-confirm__title" id="mz-confirm-title" tabIndex={-1} ref={ref}>{title}</p>
      {children && <div className="mz-confirm__text">{children}</div>}
      <div className="mz-sheet__actions">
        <button type="button" className="mz-key mz-key--surface mz-key--md" data-testid={testId ? `${testId}-cancel` : undefined} onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className="mz-key mz-key--brand mz-key--md" data-testid={testId ? `${testId}-confirm` : undefined} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  );
}
