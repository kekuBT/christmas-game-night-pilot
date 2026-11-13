# Stage 10.5 screenshots

Taken by `check-book-live` in the full gate `20261113-051445-6edb5881-21197` on `6edb588` (PASSED, exit 0), in desktop Chromium (chrome-headless-shell) at the phone widths named. Not real devices.

| File | Step | What it shows |
|---|---|---|
| `live-guest-320-christmas.png` | B1, Amina (guest, Christmas, 320 px) | Her open book after Baraka added a note and Keku approved it on his own page. The note shows approved, with no Approve or Revoke for her, and her unsent highlight draft is still in the box. |
| `md-stale-390.png` | B3, Keku (host, Everyday, 390 px) | After Baraka (cohost) revoked the note, Keku's Markdown export is taken down: "The book changed since this export. Export again for the current approvals." The export boundary sentence is under it. |
| `stale-export-390.png` | B5, Keku | After his stale page downloaded the PDF and share image without the revoked note, the export's snapshot updated his screen (the second note now pending). The Markdown taken down earlier still says why. |
| `export-check-failed-320-christmas.png` | B7, Amina | With the approval check failing on the network: "Couldn't check the latest approvals, so nothing was downloaded. Try again." |
| `entry-error-390.png` | B8, Keku | A failed approve (a 500 from a failed write): "Couldn't approve it. The Memory Book couldn't be saved, so nothing changed. Try again in a moment." The note stays pending. |
