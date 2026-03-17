import { useEffect, useRef, useState } from 'react'

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

function getSignalingUrl() {
  const configured = import.meta.env.VITE_SIGNALING_URL?.trim()
  if (configured) {
    return configured
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.hostname}:3001`
}

function CallScreen({ session, onLogout }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [matchPeer, setMatchPeer] = useState(null)
  const [mediaReady, setMediaReady] = useState(false)

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const peerIdRef = useRef(null)
  const queuedIceRef = useRef([])
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      leaveQueueAndCall({ closeSocket: true, stopMedia: true })
    }
  }, [])

  const pushSystem = (text) => {
    setMessages((prev) => [...prev, { id: `sys-${Date.now()}-${Math.random()}`, sender: 'system', text }])
  }

  const pushChat = (sender, text) => {
    setMessages((prev) => [...prev, { id: `msg-${Date.now()}-${Math.random()}`, sender, text }])
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
    peerIdRef.current = null
    setMatchPeer(null)
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
    setMediaReady(false)
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
  }

  const leaveQueueAndCall = ({ closeSocket: shouldCloseSocket = false, stopMedia = false } = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'leave' }))
    }
    setIsSearching(false)
    closePeerConnection()
    if (shouldCloseSocket) {
      closeSocket()
    }
    if (stopMedia) {
      stopLocalMedia()
    }
  }

  const ensureLocalMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      pushSystem('This browser does not support camera and mic access.')
      throw new Error('getUserMedia not supported')
    }

    if (localStreamRef.current) {
      return localStreamRef.current
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    })

    localStreamRef.current = stream
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream
    }
    setMediaReady(true)
    return stream
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
    setMatchPeer({ id: peerMeta.id, name: peerMeta.name || 'Student' })

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
          targetId: peerIdRef.current,
          candidate: event.candidate,
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setIsSearching(false)
        pushSystem(`Connected with ${peerMeta.name || 'another student'}.`)
      }
      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'closed'
      ) {
        resetRemoteMedia()
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
        pushSystem('A network candidate failed to apply.')
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
      pushSystem('A network candidate could not be added.')
    }
  }

  const startOfferToPeer = async (peerMeta) => {
    const pc = await createPeerConnection(peerMeta)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    sendSignal({
      type: 'offer',
      targetId: peerMeta.id,
      sdp: pc.localDescription,
    })
  }

  const handleSignalMessage = async (event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }

    if (message.type === 'queued') {
      setIsSearching(true)
      pushSystem('Waiting for another verified student to join.')
      return
    }

    if (message.type === 'matched') {
      const peerMeta = { id: message.peer.id, name: message.peer.name }
      setMatchPeer(peerMeta)
      setIsSearching(false)
      pushSystem(`Matched with ${peerMeta.name}. Starting call...`)
      if (message.initiator) {
        await startOfferToPeer(peerMeta)
      }
      return
    }

    if (message.type === 'peer-left') {
      pushSystem(`${message.peerName || 'Your match'} left the call.`)
      closePeerConnection()
      return
    }

    if (message.type === 'chat') {
      pushChat(message.fromName || 'peer', String(message.text || '').slice(0, 280))
      return
    }

    if (message.type === 'error') {
      pushSystem(message.message || 'Matchmaking error.')
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
      pushSystem(`WebRTC error: ${error.message}`)
    }
  }

  const ensureSocket = () => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return wsRef.current
    }

    const ws = new WebSocket(getSignalingUrl())
    wsRef.current = ws

    ws.onmessage = (event) => {
      handleSignalMessage(event)
    }

    ws.onerror = () => {
      if (!mountedRef.current) {
        return
      }
      pushSystem('Could not connect to the random call server.')
      setIsSearching(false)
    }

    ws.onclose = () => {
      if (!mountedRef.current) {
        return
      }
      setIsSearching(false)
      closePeerConnection()
    }

    return ws
  }

  const joinRandomCall = async () => {
    try {
      await ensureLocalMedia()
    } catch (error) {
      pushSystem(`Camera or mic access failed: ${error.message}`)
      return
    }

    leaveQueueAndCall()
    setMessages([])

    const ws = ensureSocket()

    const join = () => {
      ws.send(JSON.stringify({ type: 'join-queue', name: session.user.displayName }))
    }

    if (ws.readyState === WebSocket.OPEN) {
      join()
      return
    }

    ws.onopen = () => {
      if (!mountedRef.current) {
        return
      }
      join()
    }
  }

  const nextRandomCall = () => {
    leaveQueueAndCall()
    joinRandomCall()
  }

  const endCurrentCall = () => {
    leaveQueueAndCall({ stopMedia: false })
    pushSystem('Call ended.')
  }

  const leaveEverything = () => {
    leaveQueueAndCall({ stopMedia: true })
    setMessages([])
  }

  const sendMessage = (event) => {
    event.preventDefault()
    const text = draft.trim().slice(0, 280)
    if (!text || !peerIdRef.current) {
      return
    }

    const ok = sendSignal({
      type: 'chat',
      targetId: peerIdRef.current,
      text,
    })

    if (!ok) {
      pushSystem('Message send failed because the call is not connected.')
      return
    }

    pushChat('you', text)
    setDraft('')
  }

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
          <h3>Random UMN Call</h3>
          <p className="muted">
            Join the live queue. If only one other student is waiting, you will get that person.
          </p>
        </div>

        <div className="stack-actions">
          {!isSearching && !matchPeer ? (
            <button className="primary-btn" type="button" onClick={joinRandomCall}>
              Join Random Call
            </button>
          ) : null}
          {isSearching ? (
            <button className="primary-btn" type="button" onClick={leaveEverything}>
              Leave Queue
            </button>
          ) : null}
          {matchPeer ? (
            <button className="primary-btn" type="button" onClick={nextRandomCall}>
              Next Random Call
            </button>
          ) : null}
          {mediaReady || matchPeer ? (
            <button className="ghost-btn" type="button" onClick={leaveEverything}>
              Leave Call
            </button>
          ) : null}
          <button className="ghost-btn" type="button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>

      <div className="main-stage">
        <header className="glass-panel stage-header">
          <div>
            <p className="eyebrow">Campus Random Chat</p>
            <h2>{matchPeer ? `Connected with ${matchPeer.name}` : (isSearching ? 'Searching for a match' : 'Ready to match')}</h2>
            <p className="muted">
              {matchPeer
                ? 'Live peer-to-peer video call.'
                : (isSearching ? 'Waiting for another verified student to join the queue.' : 'No live match yet.')}
            </p>
          </div>
          <div className="header-actions">
            <button className="ghost-btn ghost-btn--danger" type="button">
              Report
            </button>
            <button className="ghost-btn" type="button">
              Block
            </button>
            {mediaReady || matchPeer || isSearching ? (
              <button className="ghost-btn" type="button" onClick={leaveEverything}>
                Leave
              </button>
            ) : null}
          </div>
        </header>

        <div className="video-grid">
          <div className="video-card glass-panel">
            <div className="video-feed video-feed--media">
              <video ref={localVideoRef} autoPlay playsInline muted className="video-element" />
              <div className="video-overlay">
                <span className="badge">You</span>
                <p>{session.user.displayName}</p>
              </div>
            </div>
          </div>

          <div className="video-card glass-panel">
            <div className={`video-feed video-feed--media ${matchPeer ? 'video-feed--live' : ''}`}>
              <video ref={remoteVideoRef} autoPlay playsInline className="video-element" />
              <div className="video-overlay">
                <span className="badge">{matchPeer ? 'Match' : 'Waiting'}</span>
                <p>{matchPeer ? matchPeer.name : 'No one connected'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bottom-grid">
          <section className="glass-panel info-panel">
            <h3>{matchPeer ? 'Live queue match' : 'Queue state'}</h3>
            <ul className="prompt-list">
              <li>{isSearching ? 'You are currently in the live queue.' : 'You are not in the queue.'}</li>
              <li>If nobody else is online, no match is created.</li>
              <li>If several people are waiting, the server pairs them randomly into 1:1 calls.</li>
            </ul>
          </section>

          <section className="glass-panel chat-panel">
            <div className="chat-log" aria-live="polite">
              {messages.length > 0 ? (
                messages.map((message) => (
                  <div key={message.id} className={`chat-row chat-row--${message.sender}`}>
                    <span className="chat-sender">{message.sender}</span>
                    <p>{message.text}</p>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <p>{matchPeer ? 'No messages yet.' : 'No live chat yet.'}</p>
                </div>
              )}
            </div>

            <form className="chat-compose" onSubmit={sendMessage}>
              <input
                type="text"
                placeholder={matchPeer ? 'Type a message...' : (mediaReady ? 'Join the queue to chat' : 'Allow camera and mic first')}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={280}
                disabled={!matchPeer}
              />
              <button className="primary-btn" type="submit" disabled={!matchPeer}>
                Send
              </button>
            </form>
          </section>
        </div>
      </div>
    </section>
  )
}

export default CallScreen
