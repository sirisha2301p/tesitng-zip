# Putting Draw & Guess online (Vercel + Render)

```
 Players ──▶  Vercel  — the app (web version)        https://draw-guess.vercel.app
                │
                └──▶  Render — the game server        https://draw-guess-server.onrender.com
                       (rooms, live drawing, guesses, scores, word pictures)
```

Players only ever open the Vercel link. You need three free accounts: **GitHub**, **Render**, **Vercel**.
You can sign in to Render and Vercel with your GitHub account.

The order matters: the server goes first, because the app needs the server's address.

---

## Step 1 — Put the code on GitHub

1. Sign in at https://github.com and create a new **empty** repository named `draw-guess`
   (no README, no .gitignore). Private is fine.
2. In a terminal in the `gaming` folder. The first line removes the starter git history Expo created
   inside `app/` (it only holds Expo's "Initial commit"). Without that, git would leave the app's files
   out of your repository:
   ```powershell
   Remove-Item -Recurse -Force app\.git
   git init -b main
   git add .
   git commit -m "Draw & Guess game"
   git remote add origin https://github.com/<your-username>/draw-guess.git
   git push -u origin main
   ```

## Step 2 — Pick your Vercel name

Decide the Vercel project name now, e.g. `draw-guess`. Your app will be at `https://draw-guess.vercel.app`.
If that name is taken, Vercel picks a similar one; you can fix the server setting afterwards (Step 5).

## Step 3 — Game server on Render

1. Sign in at https://render.com with GitHub.
2. **New** → **Blueprint** → give Render access to the `draw-guess` repository → select it.
3. Render reads `render.yaml` and shows one service, **draw-guess-server**. It asks for **CORS_ORIGIN**.
   Enter your Vercel address and its preview links, comma-separated, no spaces, no trailing slash:
   ```
   https://draw-guess.vercel.app,https://draw-guess-*.vercel.app
   ```
4. Click **Apply**. The first build takes a few minutes. Wait until it shows **Live**.
5. Copy the address at the top of the service page, e.g. `https://draw-guess-server.onrender.com`.
   Check it: `<that address>/health` should show `{"ok":true,"rooms":0}`.

## Step 4 — App on Vercel

1. Sign in at https://vercel.com with GitHub.
2. **Add New…** → **Project** → **Import** the `draw-guess` repository.
3. Set:
   - **Project Name:** `draw-guess` (the name from Step 2)
   - **Root Directory:** click **Edit** and choose **`app`**
   - **Framework Preset:** leave as **Other**. `app/vercel.json` already sets the build.
   - **Environment Variables:** add
     `EXPO_PUBLIC_SERVER_URL` = the Render address from Step 3 (e.g. `https://draw-guess-server.onrender.com`)
4. Click **Deploy**. When it finishes, open your app at `https://draw-guess.vercel.app`.

If you forget the environment variable, the build stops with a message telling you to set it. That's on purpose.

## Step 5 — Only if your Vercel address is different

If Vercel gave you a different address (e.g. `https://draw-guess-abc.vercel.app`), update the server:
Render → **draw-guess-server** → **Environment** → edit **CORS_ORIGIN** → **Save**. Render restarts the server.

## Step 6 — Play

Open the Vercel link, create a room, and press **Share invite link**. Friends tap the link and join.
It works on any phone or computer browser.

---

## Updating the game

`git push` to `main` and both services update by themselves:
- changes in `app/` → Vercel rebuilds the app;
- changes in `server/` → Render rebuilds the server.

If you change `EXPO_PUBLIC_SERVER_URL` in Vercel, click **Redeploy**, because the address is built into the app.

## Good to know (free plans)

- **Render's free server sleeps after 15 minutes with no players.** The first visitor sees
  *"Waking up the game server… this can take up to a minute"*. Then it's fast.
  To keep it always awake: Render → service → **Settings** → **Instance type** → Starter (about $7/month).
- **Games in progress are lost if the server restarts** (sleep, redeploy). Rooms live in the server's memory.
- Vercel's free plan is for personal, non-commercial use. A business app needs Vercel Pro.

## If something doesn't work

| What you see | Fix |
|---|---|
| Vercel build fails: "EXPO_PUBLIC_SERVER_URL is not set" | Add it in Vercel → Project → Settings → Environment Variables, then **Redeploy**. |
| App stuck on "Connecting…" for over a minute | Open `<render address>/health`. If it doesn't load, check Render's **Logs**. If it loads, check that **CORS_ORIGIN** on Render exactly matches your Vercel address (`https://`, no trailing `/`). |
| Works on `draw-guess.vercel.app` but not on a preview link | Make sure CORS_ORIGIN includes `https://draw-guess-*.vercel.app`. |
| Invite links show a 404 | Make sure Vercel's Root Directory is `app`, so `app/vercel.json` is used. |

---

## Alternative: everything on Render (one service, one account)

Create a Render **Web Service** from the repository by hand (not the blueprint):

- Root Directory: *(empty)*
- Build Command: `cd app && npm ci && npx expo export --platform web && cd ../server && npm ci && npm run build`
- Start Command: `cd server && npm start`
- Environment: `NODE_VERSION=24`, `WEB_DIR=../app/dist`
- Health Check Path: `/health`

The server then hosts the app too, at the Render address. No Vercel or `EXPO_PUBLIC_SERVER_URL` is needed.

## Phone apps (later)

The web link works on any phone. To publish Android/iOS apps, build them with EAS using
`EXPO_PUBLIC_SERVER_URL=<render address>`. Phone apps are always allowed by the server.
