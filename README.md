# 🎉 Marimic Party

A realtime multiplayer party game. One person is the **host** (big screen), everyone
else joins from their phones by **scanning a QR code**. Unlimited players.

**How to play:**

1. The host opens the app and clicks **🎮 Host a game** — a room + QR code appear.
2. Players scan the QR code, enter their name, and land in the game.
3. The host picks a round length (**10, 20 or 30 seconds**, default 20) and
   clicks **▶ Start** — the countdown begins.
4. Everyone picks a number from **0 to 10**. Once a number is taken, it's locked
   for everyone else. When the countdown ends, all numbers lock — or the host
   can hit **⏹ End round** to stop it early.

The host screen shows a live dashboard of who picked which number. On phones,
the player's number grid is laid out like a phone keypad.

## How it works

- **Frontend:** plain HTML/CSS/JS — no build step, no framework.
- **Backend:** [Firebase Realtime Database](https://firebase.google.com/products/realtime-database)
  keeps every screen in sync (number claims are atomic, so two players can never
  take the same number).
- **Hosting:** any static file host. It's designed for **GitHub Pages** —
  you just push the repo.

## 1. Set up Firebase (one-time, ~3 minutes, free)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and
   click **Add project** (no paid plan needed; the Spark/free tier is plenty).
2. In the left sidebar: **Build → Realtime Database → Create Database**.
   Pick any region and start in *test mode*.
3. When the database opens, click **Rules** and replace them with the contents of
   [`database.rules.json`](database.rules.json), then **Publish**.
   *(Test-mode rules expire after 30 days — publishing these makes them permanent.)*
4. Click the **⚙ gear → Project settings → Your apps**, choose the **Web** app
   (`</>` icon), register it, and copy the `firebaseConfig` object it shows you.
5. Paste those values into [`js/config.js`](js/config.js).

> Note: the config keys are safe to commit — they identify your project, they
> don't grant access. The security rules are what protect the data, and these
> rules allow read/write because anyone with the room code is a legit player.

## 2. Run it locally

```sh
python3 -m http.server 8000        # or: npx serve
# open http://localhost:8000
```

Open it in two windows (host in one, player in the other) to try it out.

## 3. Deploy to GitHub Pages

1. Push this folder to a GitHub repo:

   ```sh
   git init -b main
   git add .
   git commit -m "Marimic Party"
   git remote add origin https://github.com/<you>/marimic_party.git
   git push -u origin main
   ```

2. On GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**.
3. Your game goes live in a minute or two at:

   ```
   https://<you>.github.io/marimic_party/
   ```

   The QR code automatically contains the correct URL (it's derived from the
   page's own address), so nothing to configure.

Any later change is just `git push` again.

## Project layout

```
index.html            Single page: landing, host, join and player screens (hash-routed)
css/style.css         All styling
js/config.js          Your Firebase config  ← the only file you must edit
js/app.js             Game logic + routing
database.rules.json   Firebase security rules (paste into the console)
app.md                Original game spec
```

## Game data (Firebase Realtime Database)

```
rooms/{code}
├── status: "lobby" | "active" | "ended"
├── durationMs                   (host-chosen round length: 10000/20000/30000)
├── createdAt / startedAt        (server timestamps)
├── players/{playerId}
│   ├── name, at, picked         (picked = their number, null until they choose)
└── numbers/{0..10}
    └── { playerId, name, at }   (present only if the number has been claimed)
```

## Ideas for later

- Show per-player score across rounds (e.g. fastest pick wins).
- "Rare number" scoring: lower numbers worth more points.
- Kick/ban a player from the host screen.
