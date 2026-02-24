import http from 'node:http'
import crypto from 'node:crypto'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT || 3001)
const MAX_ROOM_SIZE = 2
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
)

const rooms = new Map()

function makeClientId() {
  return crypto.randomUUID()
}

function safeJson(ws, payload) {
  if (ws.readyState !== 1) {
    return
  }
  ws.send(JSON.stringify(payload))
}

function getRoom(roomId) {
  let room = rooms.get(roomId)
  if (!room) {
    room = new Map()
    rooms.set(roomId, room)
  }
  return room
}

function removeClient(ws) {
  const roomId = ws.meta?.roomId
  const clientId = ws.meta?.clientId
  const name = ws.meta?.name
  if (!roomId || !clientId) {
    return
  }

  const room = rooms.get(roomId)
  if (!room) {
    return
  }

  room.delete(clientId)
  for (const [, peer] of room) {
    safeJson(peer, {
      type: 'peer-left',
      peerId: clientId,
      peerName: name || 'Student',
    })
  }

  if (room.size === 0) {
    rooms.delete(roomId)
  }
}

function isValidRoomId(roomId) {
  return typeof roomId === 'string' && /^[a-z0-9-]{4,40}$/.test(roomId)
}

function normalizeText(value, max = 280) {
  return String(value || '').trim().slice(0, max)
}

function relayToPeer(ws, message, type) {
  const roomId = ws.meta?.roomId
  const fromId = ws.meta?.clientId
  const fromName = ws.meta?.name || 'Student'
  if (!roomId || !fromId || !message.targetId) {
    return
  }

  const room = rooms.get(roomId)
  if (!room) {
    return
  }
  const target = room.get(message.targetId)
  if (!target) {
    safeJson(ws, { type: 'error', message: 'Peer is no longer connected.' })
    return
  }

  if (type === 'chat') {
    safeJson(target, {
      type,
      fromId,
      fromName,
      text: normalizeText(message.text, 280),
    })
    return
  }

  safeJson(target, {
    type,
    fromId,
    fromName,
    sdp: message.sdp,
    candidate: message.candidate,
  })
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin || ''
  if (ALLOWED_ORIGINS.size > 0 && !ALLOWED_ORIGINS.has(origin)) {
    safeJson(ws, { type: 'error', message: 'Origin not allowed.' })
    ws.close(1008, 'origin-not-allowed')
    return
  }

  ws.meta = { clientId: makeClientId(), roomId: null, name: null }

  ws.on('message', (buffer) => {
    let message
    try {
      message = JSON.parse(buffer.toString())
    } catch {
      safeJson(ws, { type: 'error', message: 'Invalid JSON payload.' })
      return
    }

    if (message.type === 'join') {
      const roomId = normalizeText(message.roomId, 40).toLowerCase()
      const name = normalizeText(message.name, 40) || 'Student'
      if (!isValidRoomId(roomId)) {
        safeJson(ws, { type: 'error', message: 'Invalid room ID.' })
        return
      }

      removeClient(ws)
      const room = getRoom(roomId)
      if (room.size >= MAX_ROOM_SIZE) {
        safeJson(ws, { type: 'error', message: 'Room is full (max 2 people).' })
        return
      }

      ws.meta.roomId = roomId
      ws.meta.name = name
      room.set(ws.meta.clientId, ws)

      const peers = [...room.entries()]
        .filter(([id]) => id !== ws.meta.clientId)
        .map(([id, peerWs]) => ({
          id,
          name: peerWs.meta?.name || 'Student',
        }))

      safeJson(ws, {
        type: 'joined',
        roomId,
        clientId: ws.meta.clientId,
        peers,
      })

      for (const [id, peerWs] of room) {
        if (id === ws.meta.clientId) {
          continue
        }
        safeJson(peerWs, {
          type: 'peer-joined',
          peer: {
            id: ws.meta.clientId,
            name,
          },
        })
      }
      return
    }

    if (message.type === 'leave') {
      removeClient(ws)
      ws.meta.roomId = null
      return
    }

    if (message.type === 'offer' || message.type === 'answer' || message.type === 'ice' || message.type === 'chat') {
      relayToPeer(ws, message, message.type)
      return
    }

    safeJson(ws, { type: 'error', message: 'Unsupported message type.' })
  })

  ws.on('close', () => {
    removeClient(ws)
  })
})

server.listen(PORT, () => {
  console.log(`GopherCall signaling server listening on :${PORT}`)
})
