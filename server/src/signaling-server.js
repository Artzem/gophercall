import http from 'node:http'
import crypto from 'node:crypto'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT || 3001)
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
)

const clients = new Map()
const waitingQueue = []

function makeClientId() {
  return crypto.randomUUID()
}

function safeJson(ws, payload) {
  if (ws.readyState !== 1) {
    return
  }
  ws.send(JSON.stringify(payload))
}

function normalizeText(value, max = 280) {
  return String(value || '').trim().slice(0, max)
}

function removeFromQueue(clientId) {
  const index = waitingQueue.indexOf(clientId)
  if (index >= 0) {
    waitingQueue.splice(index, 1)
  }
}

function clearPairing(ws, notifyPeer = true) {
  if (!ws.meta?.peerId) {
    return
  }

  const peerId = ws.meta.peerId
  const peer = clients.get(peerId)
  ws.meta.peerId = null

  if (peer) {
    peer.meta.peerId = null
    if (notifyPeer) {
      safeJson(peer, {
        type: 'peer-left',
        peerId: ws.meta.clientId,
        peerName: ws.meta.name || 'Student',
      })
    }
  }
}

function removeClient(ws) {
  if (!ws.meta?.clientId) {
    return
  }
  removeFromQueue(ws.meta.clientId)
  clearPairing(ws)
  clients.delete(ws.meta.clientId)
}

function relayToPeer(ws, message, type) {
  const fromId = ws.meta?.clientId
  const fromName = ws.meta?.name || 'Student'
  if (!fromId || !message.targetId) {
    return
  }

  const target = clients.get(message.targetId)
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

function pairIfPossible() {
  while (waitingQueue.length >= 2) {
    const firstId = waitingQueue.shift()
    const secondId = waitingQueue.shift()
    const first = clients.get(firstId)
    const second = clients.get(secondId)

    if (!first || !second) {
      continue
    }

    first.meta.peerId = secondId
    second.meta.peerId = firstId

    safeJson(first, {
      type: 'matched',
      initiator: true,
      peer: {
        id: secondId,
        name: second.meta.name || 'Student',
      },
    })

    safeJson(second, {
      type: 'matched',
      initiator: false,
      peer: {
        id: firstId,
        name: first.meta.name || 'Student',
      },
    })
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, waiting: waitingQueue.length, clients: clients.size }))
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

  ws.meta = { clientId: makeClientId(), name: null, peerId: null }
  clients.set(ws.meta.clientId, ws)

  ws.on('message', (buffer) => {
    let message
    try {
      message = JSON.parse(buffer.toString())
    } catch {
      safeJson(ws, { type: 'error', message: 'Invalid JSON payload.' })
      return
    }

    if (message.type === 'join-queue') {
      const name = normalizeText(message.name, 40) || 'Student'
      removeFromQueue(ws.meta.clientId)
      clearPairing(ws)
      ws.meta.name = name
      waitingQueue.push(ws.meta.clientId)
      safeJson(ws, {
        type: 'queued',
        clientId: ws.meta.clientId,
      })
      pairIfPossible()
      return
    }

    if (message.type === 'leave') {
      removeFromQueue(ws.meta.clientId)
      clearPairing(ws)
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
