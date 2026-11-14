# Stage 12.6: the night card

**Authorization:** the owner, directly in chat on 2026-11-14, quoting suggestion 8 (a shareable night card): "Implement 8 as well".

- **Branch:** `claude/stage12-6-night-card`, stacked on Stage 12.5. Unmerged.
- **Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates.

**The idea:** a picture of tonight that someone can drop into the family WhatsApp group. It shows the games, the results and the medals, or the Family Cup's standings and champion. It's made on the phone, from what everyone in the room already saw. Nothing is uploaded, and nothing is shared until a person chooses to.

## 1. What's on the card (D-S126-01)
- **A casual room:**
  - "Our game night" ("Our Christmas game night" in the Christmas look);
  - the date it's made;
  - the number of games and players;
  - tonight's medal table (the TV's own rule, `lib/medals.ts`), at most five rows, with more counted;
  - the last six games with their result lines (the TV's `resultLine`), with more counted.
- **A Family Cup:**
  - "Our Family Cup" and its day;
  - the standings with points (top five; the finished Cup's frozen standings once it's finished);
  - "🏆 … is the Family Cup champion" once it's finished;
  - the games. Medals are a casual night's story, so a Cup card shows standings instead.
- **Public facts only:** names, game titles and results every screen in the room already shows after a game. Never Memory Book notes, answers, Family Questions or the room code. The file name is the night and the date (`mchezo-game-night-2026-11-14.png`).
- **The look** changes the title and the colours, never a fact.

## 2. The picture
- **Size:** 1080×1350 (portrait, the size chat apps show whole).
- **How it's drawn:** on a canvas with system fonts and emoji. No images, no downloads, $0.
- **Long names and lines** are cut with an ellipsis to fit. Nothing runs off the card.
- **The same facts in words:**
  - the image's description (`alt`);
  - "What's on the card" under the picture, for screen readers and anyone who wants to check before sharing.

## 3. Sharing
- **Share…** appears where the phone can share a picture (the Web Share API with files: most phones). It opens the phone's own share sheet.
  - Closing that sheet isn't an error.
  - A share that fails says so and points to Save.
- **Save the picture** always works. It downloads the PNG and says the file's name.
- **Where to find it:**
  - the room menu's "Share the night", for anyone in a casual room or a Family Cup once a game has finished;
  - "Share the night card" on the "That's the night!" notice;
  - "Share the Cup card" on "The Family Cup is complete".
- **Never on the TV:** it's a phone's thing to share.

## 4. Acceptance
1. Nothing to share before a game has finished. Then everyone in the room can make the card.
2. The card's facts match §1 for a casual room and a Family Cup, with no room code anywhere.
3. The picture is 1080×1350, in the phone's look, and the facts are also given in words.
4. Save gives a PNG named for the night. Share hands the PNG to the share sheet; a closed sheet isn't an error, and a failure says so.
5. The sheet fits 320 px. Nothing else moves, and the full gate passes.

## 5. Validation
- **Unit tests:** `tests/stage126-night-card.test.ts` covers:
  - the facts (casual, Christmas, cut lists, Cup, text, file name);
  - the drawing, on a recording canvas: every fact is written, nothing is off the card's edges, and the Cup's champion and standings appear.
- **Browser:** `scripts/check-night-card.mjs` covers:
  - no card before a game;
  - two games, then the host's card: facts, the 1080×1350 picture, the Everyday colours, no room code;
  - Save, checking the PNG's name and size;
  - Share on a phone with a stubbed Web Share (the file handed over), a closed share sheet, and a failed share;
  - the Christmas look's title and colours;
  - the "That's the night!" button;
  - a Family Cup's card;
  - the sheet at 320 px.
- **Gates:** targeted, fast, then one full checkpoint.

## 6. Estimate vs actual
- **Estimate:** about 3 hours.
- **Actual:** about 2 hours: 1 h 17 min from the spec to the commit (2:50 to 4:07 a.m. ET, partly while Stage 12.5's gates ran), then 41 min of gates (the full gate alone 35 min).
