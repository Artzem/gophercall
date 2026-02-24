import { useEffect, useMemo, useRef, useState } from 'react'

const starterPrompts = [
  'What are you building this semester?',
  'What is your hardest class right now?',
  'Best coffee spot near campus?',
  'Would you join a late-night study room?',
]

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

function safeRoomId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}

function parseRoomId() {
  const params = new URLSearchParams(window.location.search)
  const room = (params.get('room') || '').trim().toLowerCase()
  return /^[a-z0-9-]{4,40}$/.test(room) ? room : ''
}

function roomUrl(roomId) {
  const url = new URL(window.location.href)
  url.searchParams.set('room', roomId)
  return url.toString()
}

function getSignalingUrl() {
  const configured = import.meta.env.VITE_SIGNALING_URL?.trim()
  if (configured) {
    return configured
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.hostname}:3001`
}

function CallScreen({ session, activeMatch, onStartMatch, onEndMatch, onLogout }) {
  const [messages, setMessages] = useState([
    { id: 1, sender: 'system', text: 'Verified UMN students only. Be respectful.' },
  ])
  const [draft, setDraft] = useState('')
  const [callMode, setCallMode] = useState('random')
  const [roomId, setRoomId] = useState(() => parseRoomId())
  const [shareCopied, setShareCopied] = useState(false)
  const [mediaState, setMediaState] = useState('idle')
  const [signalState, setSignalState] = useState('offline')
  const [rtcState, setRtcState] = useState('disconnected')
  const [roomPeer, setRoomPeer] = useState(null)
  const [roomChatDraft, setRoomChatDraft] = useState('')
  const [roomMessages, setRoomMessages] = useState([
    { id: 'rs-1', sender: 'system', text: 'Create a room link and share it with one UMN student.' },
  ])
  const [roomConnected, setRoomConnected] = useState(false)

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const clientIdRef = useRef(null)
  const peerIdRef = useRef(null)
  const queuedIceRef = useRef([])
  const mountedRef = useRef(true)

  const queueStats = useMemo(
    () => ({
      online: 187,
      videoReady: 94,
      textOnly: 63,
      waiting: 21,
    }),
    [],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      teardownRoomCall({ keepLocalMedia: false, clearUrl: false })
      stopLocalMedia()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!roomId) {
      return
    }
    const current = parseRoomId()
    if (current === roomId) {
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.set('room', roomId)
    window.history.replaceState({}, '', url.toString())
  }, [roomId])

  const pushRoomSystem = (text) => {
    setRoomMessages((prev) => [...prev, { id: `sys-${Date.now()}-${Math.random()}`, sender: 'system', text }])
  }

  const pushRoomChat = (sender, text) => {
    setRoomMessages((prev) => [...prev, { id: `msg-${Date.now()}-${Math.random()}`, sender, text }])
  }

  const stopLocalMedia = () => {
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop()
      }
      localStreamRef.current = null
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }
    setMediaState('idle')
  }

  const resetRemoteMedia = () => {
    if (remoteStreamRef.current) {
      for (const track of remoteStreamRef.current.getTracks()) {
        track.stop()
      }
      remoteStreamRef.current = null
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
    setRoomPeer(null)
    setRoomConnected(false)
    peerIdRef.current = null
    setRtcState('disconnected')
  }

  const closePeerConnection = () => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null
      pcRef.current.ontrack = null
      pcRef.current.onconnectionstatechange = null
      pcRef.current.close()
      pcRef.current = null
    }
    queuedIceRef.current = []
    resetRemoteMedia()
  }

  const closeSocket = () => {
    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onmessage = null
      wsRef.current.onerror = null
      wsRef.current.onclose = null
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close()
      }
      wsRef.current = null
    }
    clientIdRef.current = null
    setSignalState('offline')
  }

  const teardownRoomCall = ({ keepLocalMedia = true, clearUrl = false } = {}) => {
    closePeerConnection()
    closeSocket()
    if (!keepLocalMedia) {
      stopLocalMedia()
    }
    if (clearUrl) {
      const url = new URL(window.location.href)
      url.searchParams.delete('room')
      window.history.replaceState({}, '', url.toString())
      setRoomId('')
    }
  }

  const ensureLocalMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaState('error')
      pushRoomSystem('This browser does not support camera/mic access.')
      throw new Error('getUserMedia not supported')
    }
    if (localStreamRef.current) {
      return localStreamRef.current
    }

    try {
      setMediaState('requesting')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      })

      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      setMediaState('ready')
      return stream
    } catch (error) {
      setMediaState('error')
      pushRoomSystem(`Camera/mic access failed: ${error.message}`)
      throw error
    }
  }

  const sendSignal = (payload) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false
    }
    ws.send(JSON.stringify(payload))
    return true
  }

  const attachRemoteStream = (stream) => {
    remoteStreamRef.current = stream
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream
    }
  }

  const createPeerConnection = async (peerMeta) => {
    if (pcRef.current) {
      return pcRef.current
    }

    const stream = await ensureLocalMedia()
    const pc = new RTCPeerConnection(RTC_CONFIG)
    pcRef.current = pc
    peerIdRef.current = peerMeta.id
    setRoomPeer({ id: peerMeta.id, name: peerMeta.name || 'Student' })
    pushRoomSystem(`Connecting to ${peerMeta.name || 'student'}...`)

    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream)
    }

    const incomingRemote = new MediaStream()
    attachRemoteStream(incomingRemote)

    pc.ontrack = (event) => {
      for (const track of event.streams[0].getTracks()) {
        incomingRemote.addTrack(track)
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && peerIdRef.current) {
        sendSignal({
          type: 'ice',
          roomId,
          targetId: peerIdRef.current,
          candidate: event.candidate,
        })
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      setRtcState(state)
      if (state === 'connected') {
        setRoomConnected(true)
        pushRoomSystem('Video call connected.')
      }
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        setRoomConnected(false)
      }
    }

    return pc
  }

  const flushQueuedIce = async () => {
    if (!pcRef.current) {
      return
    }
    const queue = [...queuedIceRef.current]
    queuedIceRef.current = []
    for (const candidate of queue) {
      try {
        await pcRef.current.addIceCandidate(candidate)
      } catch {
        pushRoomSystem('Some network candidates failed to apply.')
      }
    }
  }

  const handleOffer = async (message) => {
    const peerMeta = { id: message.fromId, name: message.fromName }
    const pc = await createPeerConnection(peerMeta)
    await pc.setRemoteDescription(new RTCSessionDescription(message.sdp))
    await flushQueuedIce()
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    sendSignal({
      type: 'answer',
      roomId,
      targetId: message.fromId,
      sdp: pc.localDescription,
    })
  }

  const handleAnswer = async (message) => {
    if (!pcRef.current) {
      return
    }
    await pcRef.current.setRemoteDescription(new RTCSessionDescription(message.sdp))
    await flushQueuedIce()
  }

  const handleIce = async (message) => {
    if (!message.candidate) {
      return
    }
    const candidate = new RTCIceCandidate(message.candidate)
    if (!pcRef.current || !pcRef.current.remoteDescription) {
      queuedIceRef.current.push(candidate)
      return
    }
    try {
      await pcRef.current.addIceCandidate(candidate)
    } catch {
      pushRoomSystem('Unable to add one network candidate.')
    }
  }

  const startOfferToPeer = async (peerMeta) => {
    const pc = await createPeerConnection(peerMeta)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    sendSignal({
      type: 'offer',
      roomId,
      targetId: peerMeta.id,
      sdp: pc.localDescription,
    })
  }

  const handleSignalMessage = async (raw) => {
    let message
    try {
      message = JSON.parse(raw.data)
    } catch {
      return
    }

    if (message.type === 'joined') {
      clientIdRef.current = message.clientId
      setSignalState('joined')
      pushRoomSystem(`Joined room ${message.roomId}.`)
      if (message.peers?.length > 0) {
        const peer = message.peers[0]
        if (message.peers.length > 1) {
          pushRoomSystem('This room already has more than one person. Use a new link for 1:1 calls.')
        }
        await startOfferToPeer(peer)
      } else {
        pushRoomSystem('Waiting for someone to open your link...')
      }
      return
    }

    if (message.type === 'peer-joined') {
      if (peerIdRef.current) {
        pushRoomSystem('Another user tried to join, but this room is already in use.')
        return
      }
      pushRoomSystem(`${message.peer.name || 'Student'} joined the room.`)
      return
    }

    if (message.type === 'peer-left') {
      pushRoomSystem(`${message.peerName || 'Student'} left the room.`)
      closePeerConnection()
      return
    }

    if (message.type === 'chat') {
      pushRoomChat(message.fromName || 'peer', String(message.text || '').slice(0, 280))
      return
    }

    if (message.type === 'error') {
      pushRoomSystem(message.message || 'Room signaling error.')
      return
    }

    try {
      if (message.type === 'offer') {
        await handleOffer(message)
      }
      if (message.type === 'answer') {
        await handleAnswer(message)
      }
      if (message.type === 'ice') {
        await handleIce(message)
      }
    } catch (error) {
      pushRoomSystem(`WebRTC error: ${error.message}`)
    }
  }

  const joinRoomCall = async () => {
    if (!roomId) {
      pushRoomSystem('Create a room link first.')
      return
    }
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      pushRoomSystem('Camera/mic usually require HTTPS (or localhost).')
    }
    try {
      await ensureLocalMedia()
    } catch {
      return
    }
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return
    }

    closePeerConnection()
    setSignalState('connecting')

    const ws = new WebSocket(getSignalingUrl())
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) {
        return
      }
      setSignalState('open')
      sendSignal({
        type: 'join',
        roomId,
        name: session.user.displayName,
        email: session.user.email,
      })
    }

    ws.onmessage = (event) => {
      handleSignalMessage(event)
    }

    ws.onerror = () => {
      if (!mountedRef.current) {
        return
      }
      setSignalState('error')
      pushRoomSystem('Could not connect to signaling server.')
    }

    ws.onclose = () => {
      if (!mountedRef.current) {
        return
      }
      setSignalState('offline')
      pushRoomSystem('Disconnected from signaling server.')
      closePeerConnection()
    }
  }

  const leaveRoomCall = () => {
    teardownRoomCall({ keepLocalMedia: false, clearUrl: false })
    setRoomMessages((prev) => [...prev, { id: `sys-${Date.now()}`, sender: 'system', text: 'Left room call.' }])
  }

  const createRoomLink = () => {
    const next = safeRoomId()
    setRoomId(next)
    setCallMode('room')
    setRoomMessages([
      { id: 'rs-1', sender: 'system', text: 'Create a room link and share it with one UMN student.' },
      { id: `sys-${Date.now()}`, sender: 'system', text: `Room created: ${next}` },
    ])
    setShareCopied(false)
  }

  const copyRoomLink = async () => {
    if (!roomId) {
      createRoomLink()
      return
    }
    try {
      await navigator.clipboard.writeText(roomUrl(roomId))
      setShareCopied(true)
      pushRoomSystem('Invite link copied.')
    } catch {
      pushRoomSystem(`Copy failed. Share this manually: ${roomUrl(roomId)}`)
    }
  }

  const sendMessage = (event) => {
    event.preventDefault()
    const text = draft.trim().slice(0, 280)
    if (!text) {
      return
    }

    setMessages((prev) => [...prev, { id: Date.now(), sender: 'you', text }])
    setDraft('')
  }

  const sendRoomMessage = (event) => {
    event.preventDefault()
    const text = roomChatDraft.trim().slice(0, 280)
    if (!text || !peerIdRef.current) {
      return
    }
    const ok = sendSignal({
      type: 'chat',
      roomId,
      targetId: peerIdRef.current,
      text,
    })
    if (!ok) {
      pushRoomSystem('Chat send failed: signaling is offline.')
      return
    }
    pushRoomChat('you', text)
    setRoomChatDraft('')
  }

  const nextMatch = () => {
    onEndMatch()
    onStartMatch()
    setMessages([
      { id: 1, sender: 'system', text: 'New match connected. Keep it friendly.' },
    ])
  }

  const activeRemoteName = roomPeer?.name || (roomConnected ? 'Connected student' : 'Waiting')

  return (
    <section className="call-layout">
      <aside className="left-rail glass-panel">
        <div className="left-rail__top">
          <p className="eyebrow">Signed In</p>
          <h2>{session.user.displayName}</h2>
          <p className="muted">{session.user.email}</p>
          <span className="badge badge--secure">{session.trustLabel}</span>
        </div>

        <div className="card-lite">
          <h3>Mode</h3>
          <div className="stack-actions">
            <button
              className={callMode === 'random' ? 'primary-btn' : 'ghost-btn'}
              type="button"
              onClick={() => setCallMode('random')}
            >
              Random UMN Chat
            </button>
            <button
              className={callMode === 'room' ? 'primary-btn' : 'ghost-btn'}
              type="button"
              onClick={() => setCallMode('room')}
            >
              Share Link Call
            </button>
          </div>
        </div>

        {callMode === 'random' ? (
          <>
            <div className="card-lite">
              <h3>Queue Status</h3>
              <ul className="stats-list">
                <li><span>Online</span><strong>{queueStats.online}</strong></li>
                <li><span>Video-ready</span><strong>{queueStats.videoReady}</strong></li>
                <li><span>Text-only</span><strong>{queueStats.textOnly}</strong></li>
                <li><span>Waiting now</span><strong>{queueStats.waiting}</strong></li>
              </ul>
            </div>

            <div className="card-lite">
              <h3>Your Filters</h3>
              <div className="chip-wrap">
                <span className="chip">UMN verified</span>
                <span className="chip">18+</span>
                {session.user.major ? <span className="chip">{session.user.major}</span> : null}
                {session.user.interests.map((interest) => (
                  <span className="chip" key={interest}>{interest}</span>
                ))}
              </div>
            </div>

            <div className="stack-actions">
              {!activeMatch ? (
                <button className="primary-btn" type="button" onClick={onStartMatch}>
                  Find a Gopher
                </button>
              ) : (
                <button className="primary-btn" type="button" onClick={nextMatch}>
                  Next Match
                </button>
              )}
              <button className="ghost-btn" type="button" onClick={onLogout}>
                Log out
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="card-lite">
              <h3>Shareable Room</h3>
              <label className="mini-label" htmlFor="room-id-input">Room ID</label>
              <input
                id="room-id-input"
                className="room-input"
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40))}
                placeholder="ex: gophers26"
              />
              <p className="muted room-link">
                {roomId ? roomUrl(roomId) : 'Create a room to generate an invite URL.'}
              </p>
              <div className="stack-actions">
                <button className="primary-btn" type="button" onClick={createRoomLink}>
                  New Room Link
                </button>
                <button className="ghost-btn" type="button" onClick={copyRoomLink}>
                  {shareCopied ? 'Copied' : 'Copy Invite Link'}
                </button>
                <button className="ghost-btn" type="button" onClick={joinRoomCall}>
                  Join Room Call
                </button>
                <button className="ghost-btn" type="button" onClick={leaveRoomCall}>
                  Leave Room
                </button>
              </div>
            </div>

            <div className="card-lite">
              <h3>Call Status</h3>
              <ul className="stats-list">
                <li><span>Media</span><strong>{mediaState}</strong></li>
                <li><span>Signaling</span><strong>{signalState}</strong></li>
                <li><span>WebRTC</span><strong>{rtcState}</strong></li>
                <li><span>Peer</span><strong>{roomPeer?.name || 'none'}</strong></li>
              </ul>
            </div>

            <div className="stack-actions">
              <button className="ghost-btn" type="button" onClick={onLogout}>
                Log out
              </button>
            </div>
          </>
        )}
      </aside>

      <div className="main-stage">
        <header className="glass-panel stage-header">
          <div>
            <p className="eyebrow">{callMode === 'room' ? 'Share Link Video Call' : 'Campus Random Chat'}</p>
            <h2>
              {callMode === 'room'
                ? (roomId ? `Room ${roomId}` : 'Create a room link')
                : (activeMatch ? `Connected with ${activeMatch.name}` : 'Ready to match')}
            </h2>
            <p className="muted">
              {callMode === 'room'
                ? 'Send the same URL to one other verified UMN student, then both click "Join Room Call".'
                : (activeMatch
                  ? `${activeMatch.major} • ${activeMatch.year} • ${activeMatch.campus}`
                  : 'Press "Find a Gopher" to start a video or text session.')}
            </p>
          </div>
          <div className="header-actions">
            <button className="ghost-btn ghost-btn--danger" type="button">
              Report
            </button>
            <button className="ghost-btn" type="button">
              Block
            </button>
            {callMode === 'random' && activeMatch ? (
              <button className="ghost-btn" type="button" onClick={onEndMatch}>
                End
              </button>
            ) : null}
            {callMode === 'room' ? (
              <button className="ghost-btn" type="button" onClick={leaveRoomCall}>
                Leave Call
              </button>
            ) : null}
          </div>
        </header>

        <div className="video-grid">
          <div className="video-card glass-panel">
            <div className="video-feed video-feed--media">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="video-element"
              />
              <div className="video-overlay">
                <span className="badge">You</span>
                <p>{session.user.displayName}</p>
              </div>
            </div>
          </div>
          <div className="video-card glass-panel">
            <div className={`video-feed video-feed--media ${(callMode === 'room' && roomConnected) || activeMatch ? 'video-feed--live' : ''}`}>
              {callMode === 'room' ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="video-element"
                />
              ) : null}
              <div className="video-overlay">
                <span className="badge">{callMode === 'room' ? (roomConnected ? 'Room' : 'Waiting') : (activeMatch ? 'Match' : 'Waiting')}</span>
                <p>{callMode === 'room' ? activeRemoteName : (activeMatch ? activeMatch.name : 'Searching queue...')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bottom-grid">
          <section className="glass-panel info-panel">
            {callMode === 'room' ? (
              <>
                <h3>How this works</h3>
                <ul className="prompt-list">
                  <li>Create a room link and copy it.</li>
                  <li>Send the exact URL to one other UMN student.</li>
                  <li>Both users verify email and click Join Room Call.</li>
                  <li>Camera/mic require HTTPS or `localhost`.</li>
                  <li>For reliable campus networks, add a TURN server (see docs).</li>
                </ul>
              </>
            ) : (
              <>
                <h3>{activeMatch ? `${activeMatch.name}'s vibe` : 'Conversation starters'}</h3>
                {activeMatch ? (
                  <>
                    <p className="muted">{activeMatch.bio}</p>
                    <div className="chip-wrap">
                      {activeMatch.vibe.map((tag) => (
                        <span className="chip" key={tag}>{tag}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <ul className="prompt-list">
                    {starterPrompts.map((prompt) => (
                      <li key={prompt}>{prompt}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <section className="glass-panel chat-panel">
            <div className="chat-log" aria-live="polite">
              {(callMode === 'room' ? roomMessages : messages).map((message) => (
                <div key={message.id} className={`chat-row chat-row--${message.sender}`}>
                  <span className="chat-sender">{message.sender}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>

            {callMode === 'room' ? (
              <form className="chat-compose" onSubmit={sendRoomMessage}>
                <input
                  type="text"
                  placeholder={peerIdRef.current ? 'Send room chat message...' : 'Join the room and wait for a peer'}
                  value={roomChatDraft}
                  onChange={(e) => setRoomChatDraft(e.target.value)}
                  maxLength={280}
                  disabled={!peerIdRef.current}
                />
                <button className="primary-btn" type="submit" disabled={!peerIdRef.current}>
                  Send
                </button>
              </form>
            ) : (
              <form className="chat-compose" onSubmit={sendMessage}>
                <input
                  type="text"
                  placeholder={activeMatch ? 'Type a message...' : 'Match first to chat'}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={280}
                  disabled={!activeMatch}
                />
                <button className="primary-btn" type="submit" disabled={!activeMatch}>
                  Send
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}

export default CallScreen
