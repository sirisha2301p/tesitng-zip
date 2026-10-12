# Draw & Guess

A multiplayer drawing and guessing game. One player draws a secret word; the others guess it.

- `server/`: game server (Node.js + Socket.IO). See [server/README.md](server/README.md).
- `app/`: mobile and web app (Expo / React Native). See [app/README.md](app/README.md).

## Quick start

```bash
# terminal 1
cd server && npm install && npm run dev

# terminal 2
cd app && npm install && npx expo start
```

Scan the QR code with Expo Go on your phone (same Wi-Fi), or press `w` to open it in the browser.

## Play with friends anywhere

See [DEPLOY.md](DEPLOY.md): the app on **Vercel**, the game server on **Render** (both free). Friends then just open a link.
