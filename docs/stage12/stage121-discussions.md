# Stage 12.1: discussions for the owner

You asked me to document any further discussions. These are ideas I did **not** build, because each one either changes a reviewed rule or a Cup rule, or is bigger than this stage. For each idea:
- **What:** what it is;
- **Why:** why I think it's worth it;
- **Risk:** what it touches;
- **Size:** a rough estimate;
- **My view:** what I'd do.

Nothing here is decided. Pick any and I'll write a spec.

## A. Finish the one-path idea

### A1. Let "Make it a Family Cup" be undone until the first official game ends
- **What:** the upgrade is one way today, and the sheet says so. Until the Cup's first official game finishes, nothing official exists yet, so going back to casual loses nothing. The menu item would read "Back to a casual game night" during that window.
- **Why:** "It can't be undone" is the scariest line on the sheet. Most regret happens in the first minutes.
- **Risk:**
  - the engine needs a reverse path (restore `casual`, drop the unused Cup record, keep the ledger event);
  - the Memory Book must not have filed anything under Day 1, which holds because no Cup game has finished.
- **Size:** about 2 hours with tests.
- **My view:** yes, a cheap win.

### A2. A gentle nudge after a good casual night
- **What:** after two or more finished casual games, the host's lobby shows a small dismissible card: "Enjoying this? Make it a Family Cup: same room, official games over 7 days." Host only, shown once per room.
- **Why:** the upgrade now lives in the room menu, which is right for the door. Some hosts will never find it.
- **Risk:** low. It's presentation only, with no server change.
- **Size:** about 1 hour.
- **My view:** yes.

### A3. Content follows the look (deferred in D-S121-03)
- **What:** a host whose phone is in the Christmas look gets Christmas questions by default. They can still choose Everyday.
- **Why:** it removes the last routine switch. Today a host can see a Christmas TV and get Everyday questions without noticing.
- **Risk:** it reverses the reviewed Stage 8.2 rule ("content is Everyday unless the host picks Christmas"), so it needs your ruling and probably ChatGPT's review. The rule exists because the look is per device and the content is per room. A guest's look must never change what the room deals.
- **Size:** about 2 hours, plus re-baselining a few drivers.
- **My view:** worth doing, but only as "the host's look sets the room's default content once, at room creation", never live.

### A4. Quick Party in a Family Cup
- **What:** the casual room's best convenience, a lineup that runs itself, also works in a Cup, with Official or Practice set per lineup.
- **Why:** after the upgrade the Cup loses Quick Party, What's next and Play again. It feels like a step down right when the family is most engaged.
- **Risk:** it touches the Cup's start rules (official starts need two players, readiness and per-day roster rules), lineup persistence and the Memory Book's day filing.
- **Size:** about 1 day with gates.
- **My view:** the most valuable next stage for the Cup. It deserves its own spec and review.

### A5. A short TV link
- **What:** a `/tv` address that goes straight to watching: type the code once, no "Join" form, no "Watch instead" button. The phone's Invite sheet would show "On the TV, open <host>/tv".
- **Why:** setting up the TV is still the clumsiest step of a night. A TV browser can't scan the QR code, so it needs a short URL.
- **Risk:** low. It's a route and a screen, and spectator mode already exists.
- **Size:** about 1–2 hours.
- **My view:** yes. This is the "TV as hero" idea's missing first step.

## B. More TV big moments

### B1. "Night complete" for casual rooms
- **What:** the host can end the night (room menu). The TV shows the night's recap:
  - the medal table's top three;
  - games played;
  - the best moments already in the Memory Book;
  - a closing line.
- **Why:** a Cup has its day trophy; a casual night just stops.
- **Risk:** it's a new session state, so it needs care with the Stage 7.2 flow (breaks, What's next).
- **Size:** about half a day.
- **My view:** yes, after A4.

### B2. Finish the Family Cup (deferred in D-S121-07)
- **What:** after Day 7, the host ends the Cup. The server records a final standing, and the TV crowns a champion with the full podium. Until then the TV says "leading on the final day".
- **Why:** the Cup's whole arc points at this moment, and today it never comes.
- **Risk:** it's a Cup-rules addition:
  - what "ended" means for late games and practice;
  - what happens to a day with no official game;
  - whether the result is final for the Memory Book.
- **Size:** about 1 day.
- **My view:** needed before the first real family Cup. It needs your rules first.

### B3. TV sound, off by default
- **What:** a short sting on the podium's gold step and the day trophy, made with WebAudio (no assets, $0). It's on the TV only, and silent with Animations Off or when muted.
- **Why:** TV moments land harder with sound, and phones stay silent.
- **Risk:** autoplay rules: browsers need one click on the TV first. The director's Resume button can be that click.
- **Size:** about 2 hours.
- **My view:** nice to have, after the two items above.

### B4. Phones step back when a TV is watching
- **What:** when the room has a TV (the server already counts spectators), a phone's results screen shows a short "Look at the TV" summary instead of the full standings. People can still open the full standings on their phone.
- **Why:** this is what the "phones are controllers" principle means in practice: one place to look, together.
- **Risk:** a TV count isn't proof the TV is on screen, so phones must always keep the full result one tap away.
- **Size:** about half a day.
- **My view:** try it on one game first (Math Mayhem) and see how it feels on a real night.

## C. Things I noticed and left alone
- **The "qualifying" label on the Cup card** reads like jargon on a TV. It means "hasn't played enough Cup days to count yet". I'd show it once, as a footnote, rather than on every row. This is copy only.
- **The Cup's display name is "Individual Family Cup"** (the format's label). On a TV, "Family Cup" alone may read better, with the format on the Cup screen. This is copy only.
- **Driver artifact, not a product issue:** `check-one-path` answers over the API for a seat whose phone is also open, so that phone may briefly show "Your answer is already in". Real play never has two clients answering for one seat. The README next to the screenshots says so.
