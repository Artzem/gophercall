# GopherCall Signaling Server (Room Calls)

This server lets two users on the same room URL exchange WebRTC signaling messages (`offer`, `answer`, `ice`) and room chat.

## Run locally

1. Install deps:
   `cd server && npm install`
2. Start signaling server:
   `npm run dev`
3. Start frontend in another terminal:
   `cd .. && npm run dev`

## Frontend config

Set `/Users/artsiombaranovich/gophercall/.env.local`:

```bash
VITE_SIGNALING_URL=ws://localhost:3001
```

## Production notes

- Use `wss://` behind HTTPS.
- Set `ALLOWED_ORIGINS=https://yourdomain.com`.
- Add auth/session checks to the WebSocket handshake before accepting joins.
- Add TURN credentials (coturn) for reliable campus-network connections.
