# Mchezo on your iPhone through GitHub Codespaces (private preview)

A temporary, private cloud copy of Mchezo that you open in Safari. It runs the same server and app as `npm run serve:device-test`: test-mode content, separate test data, never official.

**Who can open it:** only you, signed in to GitHub. The port stays **private**, the Codespaces default. Other people's phones can't join unless they are signed in as you, so don't share your login. Letting family join would need a **public** port, and that needs the owner's explicit approval first.

**Cost:** $0 inside GitHub's free monthly allowance (see "Costs" below). Delete the codespace when you're done.

## Before the first time (2 minutes, in Safari)

1. Open **github.com/settings/codespaces** and set **Default idle timeout** to **120 minutes**. The default is 30. The game traffic doesn't count as activity, so with 30 minutes the preview would stop mid-session. This setting applies to codespaces created after you change it.
2. Open **github.com/settings/billing** and check the Codespaces usage. If your account has a payment method, check that the Codespaces budget is **$0**, so usage stops at the free allowance instead of being charged.

## Open Mchezo (about 5 minutes the first time)

1. In Safari, open:
   **https://codespaces.new/kekuBT/christmas-game-night-pilot/tree/claude/codespaces-preview**
2. Sign in if asked. Keep the machine type at **2-core**, then tap **Create codespace**.
3. A small VS Code editor opens. It's cramped on a phone; you don't need to use it. Wait 3–5 minutes while it installs and builds.
4. When it's ready, a notice says *"Your application running on port 3000 is available"*. Tap **Open in Browser**. Or open **Terminal** at the bottom and copy the address from the line starting `Codespaces preview … https://…app.github.dev/`.
5. The address opens in a new Safari tab. GitHub may first confirm that it's you; tap continue. You should see the Mchezo home screen.
6. **Add it to your Home Screen** (Share → Add to Home Screen) so you can get back to it quickly.

**Playing alone on one phone:**
- Tap **Host a game**.
- For a second player, open the same address in a **new Safari tab** and join with the room code. Each tab is a separate seat.
- iOS pauses background tabs, so switch tabs to answer for each player.
- An iPad or a computer signed in to *your* GitHub account can join the same way.

**If it stops** (idle timeout, or after 3 hours when GitHub asks you to confirm again):
- Open **github.com/codespaces**, tap the codespace, and it restarts. The server starts by itself, and rooms are kept.
- If the page doesn't load after a restart, open Terminal in the editor and run `bash .devcontainer/start-preview.sh`.

## When you're done

Go to **github.com/codespaces**, tap **⋯** next to the codespace, then **Delete**. Deleting stops all compute and storage use. Stopping alone still uses a little storage.

## Costs

GitHub's included monthly usage on a personal **Free** plan is 120 core-hours and 15 GB-month of storage (Pro: 180 / 20).

- A 2-core codespace uses 2 core-hours per hour it is running, so the allowance is about **60 hours a month**. A 2-hour test uses 4 core-hours.
- Storage for this codespace is a few GB, billed only while it exists, so a day uses a tiny fraction of 15 GB-month.
- Without a payment method, GitHub blocks use when the allowance runs out, so nothing is charged.
- With a payment method, personal-account budgets stop usage at their limit, so keep the Codespaces budget at $0.

## Known limits of this preview

- **Private only:** it's a one-person test (you, in several tabs). It isn't a family test session; that needs the home Wi-Fi setup in [REAL_DEVICE_TESTING.md](REAL_DEVICE_TESTING.md), or a public port with your approval.
- **Network:** Codespaces' forwarding sits between the phone and the server, so lag can differ from home Wi-Fi.
- **WebSockets:** some reports say WebSockets through Codespaces are dropped every few minutes. The app reconnects by itself, but a brief "Reconnecting…" banner that clears is expected. Note it if it happens often.
- **Wording:** the server and test data are the same as on Wi-Fi, but the address is `https://…app.github.dev`, not a home-network address.
