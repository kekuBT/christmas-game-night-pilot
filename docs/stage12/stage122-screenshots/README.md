# Stage 12.2 screenshots

**Source:** local runs of `scripts/check-one-path.mjs` (run `s122r2`) and `scripts/check-content-look.mjs` (run `s122r2`) on the tree committed as `f4fc9bd`. Desktop Chromium, phones at 390×844, the TV at 1920×1080. The **before** pictures are Stage 12.1's committed journey screenshots (`d80dfb7`).

| File | What it shows |
|---|---|
| `host-nudge-390.png` | **The nudge (D-S122-02):** the host's lobby after two finished casual games: "Enjoying tonight?" with Make it a Family Cup and Not now. Guests never see it. |
| `before-make-cup-sheet-390.png` → `make-cup-sheet-390.png` | **The Make-a-Cup sheet:** "It can't be undone" became "Changed your mind? Until the first official game finishes, you can go back to a casual game night from the room menu." |
| `undo-cup-sheet-390.png` | **The undo (D-S122-01):** the host's "Back to a casual game night" sheet, before any official game has finished: what comes back, what stays, and that it can be a Family Cup again later. |
| `guest-undone-notice-390.png` | **A guest's lobby after the undo:** "A casual game night again". The red "Your answer is already in" line at the bottom is a driver artifact: the driver answers over the API for seats whose phones are open (the same note as Stage 12.1). |
| `invite-tv-line-390.png` | **The Invite sheet (D-S122-03):** "On the TV: open <host>/tv and type the code." Here the host is `localhost:4426` because the driver runs locally, which the yellow warning explains. On a home network it shows the computer's Wi-Fi address. |
| `tv-entry-1920.png` | **`/tv` on a TV:** one code box and "Show on this TV", disabled until the code is complete. `/tv?code=ABC123` skips this screen and starts watching at once. |
| `host-christmas-note-390.png` | **Content follows the look (D-S122-04):** a host whose phone is pinned to the Christmas look sees that tonight's questions start as Christmas ones, and that they can switch in the lobby. |
| `before-tv-final-cup-1920.png` → `tv-final-cup-1920.png` | **TV copy (D-S122-05):** "· qualifying" on every row became a † on the total, with one footnote: "† Not eligible to win yet: too few counted Cup days." |
| `tv-lobby-cup-1920.png`, `tv-cup-view-1920.png` | **"Family Cup" on the TV:** the lobby card and the Cup standings view, after going back to casual and making it a Family Cup again. |
