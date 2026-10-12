# Draw & Guess — game server

Real-time server for the Draw & Guess app: Node.js + Socket.IO, written in TypeScript.
The server is the only authority: it picks the word, runs the timer, checks guesses and keeps score.
The word is sent **only to the drawer**, and a skipped word is never sent to anyone else.

## Run it

```bash
npm install
npm run dev        # development, restarts on change  -> http://localhost:3001
npm test           # all tests
npm run build && npm start   # production build
```

Settings (see `.env.example`): `PORT` (default 3001), `CORS_ORIGIN` (default `*`).

Game rules (skips per turn, points, pause between turns, reconnect grace) are in `src/config.ts`.

## Files

| Path | What it does |
|---|---|
| `src/protocol.ts` | **The contract with the app**: every event name, payload type and validation rule. Share it with the app. |
| `src/game/Room.ts` | All game rules: lobby, turns, timer, skip, guesses, scoring, rotation, reconnects. |
| `src/game/RoomManager.ts` | Creates rooms and room codes (6 characters, no look-alike letters). |
| `src/socket/handlers.ts` | Connects Socket.IO events to `Room`, validates input, answers through acks. |
| `src/words/` | Word bank loading and guess matching. |
| `data/words.json` | The word bank: 300 words in 10 categories. |

## HTTP

- `GET /health` → `{ ok: true, rooms }`
- `GET /categories` → `{ categories: [{ id, name, wordCount }] }`; `mixed` is first. Use it for the category picker.

## Socket events

Requests send an **ack** callback and get back `{ ok: true, data }` or `{ ok: false, error, message }`.
With socket.io-client: `const res = await socket.emitWithAck('room:join', { code, name })`.

### App → server

| Event | Payload | Who | Returns |
|---|---|---|---|
| `room:create` | `{ name, settings: { teamSize 2–10, turnTime 5/10/…/30, category?, rounds? } }` | anyone | `JoinResult` |
| `room:join` | `{ code, name }` | anyone | `JoinResult` |
| `room:rejoin` | `{ code, playerId, token }` | after a dropped connection | `JoinResult` |
| `room:leave` | — | player | `null` |
| `game:start` | — | host, all seats filled | `null` |
| `game:restart` | — | host, after game over | `null` |
| `turn:skip` | — | drawer, max 2 per turn, before anyone guesses | new `DrawerWord` |
| `guess:submit` | `{ text }` | guessers | `{ result: 'correct', points, word }` / `'close'` / `'wrong'` |
| `draw:stroke` | `{ strokeId, color '#RRGGBB', width 1–40, points [[x,y]…] }` | drawer | (no ack) |
| `draw:undo` / `draw:clear` | — | drawer | (no ack) |

Stroke coordinates are **0..1 of the canvas size**, so every phone draws the same picture.
Send a long stroke as several segments with the same `strokeId`. Undo removes the last whole stroke.

### Server → app

| Event | When |
|---|---|
| `room:state` | Any change to players, scores, host or status. Full `RoomSnapshot`. |
| `turn:start` | A new turn: drawer, round, `endsAt`, word lengths for the blanks. |
| `turn:word` | **Drawer only**: the word, its image, `skipsLeft`. |
| `turn:skipped` | Drawer skipped: canvas cleared, timer restarted. |
| `draw:stroke` / `draw:undo` / `draw:clear` | The drawer's canvas changes (sent to everyone except the drawer). |
| `guess:message` | A wrong guess, for the feed. |
| `guess:correct` | Someone got it (name and points, never the word). |
| `turn:end` | Reveals the word, points for each player, leaderboard, next drawer. |
| `game:over` | Final leaderboard. |

Timers: the server sends `endsAt` with `serverNow`. Count down from
`endsAt - serverNow` rather than the phone's clock, which may be off.

## Game rules (current defaults)

- The game starts when **all** `teamSize` players have joined. Everyone draws once per round, in join order.
- Guesser points: 100 for an instant guess, scaling down with time left, minimum 10. The drawer gets **50 per correct guesser**.
  Only correct guesses score.
- A turn ends when time runs out, when everyone has guessed, or when the drawer leaves. Then there is a 5-second pause before the next turn.
- Skip: up to 2 per turn, gives a fresh word and a fresh timer. Not allowed once someone has guessed.
- Close guesses (1–2 letters off) are told only to the guesser. Aliases, plurals, case and spacing are accepted
  (`Ice-Cream` = `ice cream` = `icecream`).
- A player who drops keeps their seat for 30 s and can `room:rejoin` with the `playerId` + `token` from their join.
  If fewer than 2 players remain, the game ends.
- Rooms live in memory. A restart of the server ends all games, which is fine for one server.
  Move room state to Redis before running several servers.

## Word bank

`data/words.json`: categories plus words, each with `difficulty` (easy/medium/hard), `aliases`
(other accepted answers, including Hindi/Telugu names in Latin letters) and an optional `imageUrl`.
Ids are generated as `<category>-<word>` (e.g. `food-ice-cream`). The file is validated when the server starts.
Duplicate words or unknown categories stop it with a clear error.

### Word pictures

299 of 300 words have a picture, served by this server from `public/images/` (`GET /images/<word-id>.svg`).
The drawer sees it in `turn:word`; everyone sees it on the turn result screen.

- Most are Twemoji emoji (CC-BY 4.0; credited on the app's home screen). Which emoji a word uses is set in
  `data/word-images.json`.
- 42 words with no fitting emoji (samosa, dosa, rangoli, rakhi, Taj Mahal, kabaddi…) have hand-made
  illustrations in `assets/custom-images/`. A file there always wins over the emoji, so to replace any
  picture, drop `<word-id>.svg` in that folder.
- After adding words or changing pictures, run `npm run images`. It checks that every word has an entry,
  downloads or copies the pictures, and fills in `imageUrl` in `words.json`.
- `festivals-ganesha` has no picture yet (a deity is better drawn by a real illustrator); the app shows a pencil.
