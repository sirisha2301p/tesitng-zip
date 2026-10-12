# Draw & Guess — app

Expo (React Native) app for Android, iOS and web. Built with Expo Router, react-native-svg for the canvas,
Zustand for state and socket.io-client to talk to the game server in `../server`.

## Run it

1. Start the server (in another terminal):
   ```bash
   cd ../server
   npm install
   npm run dev
   ```
2. Start the app:
   ```bash
   npm install
   npx expo start
   ```
   - **Phone:** install **Expo Go**, then scan the QR code. The phone must be on the same Wi-Fi as the computer.
   - **Browser:** press `w`. Open a second browser window (or a private window) to play as a second player.

The app finds the server at your computer's address on port 3001. If a phone can't connect, allow Node.js through
the Windows firewall (port 3001), or set `EXPO_PUBLIC_SERVER_URL` (see `.env.example`).

## How it is organised

| Path | What it is |
|---|---|
| `src/app/index.tsx` | Home: your name, create a room, join with a code |
| `src/app/create.tsx` | Room setup: team size, time per turn, category, rounds |
| `src/app/lobby.tsx` | Waiting room: room code, share invite, players, Start (host) |
| `src/app/game.tsx` | The game. It shows one of the views below depending on the phase and your role |
| `src/components/game/DrawerView.tsx` | Drawer: secret word, canvas, colours, eraser, undo, clear, skip |
| `src/components/game/GuesserView.tsx` | Guesser: blanks, live drawing, scores, guess feed, guess box |
| `src/components/game/TurnResultView.tsx` | Between turns: the answer, points this turn, leaderboard, next drawer |
| `src/components/game/GameOverView.tsx` | Final scores, Play again (host), Leave |
| `src/app/join/[code].tsx` | Invite links `drawguess://join/CODE` open Home with the code filled in |
| `src/store/game.ts` | All game state and server messages |
| `src/components/DrawingCanvas.tsx` | The shared canvas (points are fractions of the canvas, so every screen matches) |
| `src/theme.ts` | Colours and fonts from the mockups |

The server decides which screen you see. When the room's status changes (lobby, playing, between turns, finished),
`src/app/_layout.tsx` moves everyone to the right screen. Message types come straight from
`../server/src/protocol.ts`, so the app and server can't drift apart.

If the connection drops, the app reconnects and rejoins the same seat automatically, also after the app restarts.

## Checks

```bash
npm run typecheck
npm run lint
npx expo-doctor
```
