import { useMemo, useState } from 'react'

const starterPrompts = [
  'What are you building this semester?',
  'What is your hardest class right now?',
  'Best coffee spot near campus?',
  'Would you join a late-night study room?'
]

function CallScreen({ session, activeMatch, onStartMatch, onEndMatch, onLogout }) {
  const [messages, setMessages] = useState([
    { id: 1, sender: 'system', text: 'Verified UMN students only. Be respectful.' },
  ])
  const [draft, setDraft] = useState('')

  const queueStats = useMemo(
    () => ({
      online: 187,
      videoReady: 94,
      textOnly: 63,
      waiting: 21,
    }),
    [],
  )

  const sendMessage = (event) => {
    event.preventDefault()
    const text = draft.trim().slice(0, 280)
    if (!text) {
      return
    }

    setMessages((prev) => [...prev, { id: Date.now(), sender: 'you', text }])
    setDraft('')
  }

  const nextMatch = () => {
    onEndMatch()
    onStartMatch()
    setMessages([
      { id: 1, sender: 'system', text: 'New match connected. Keep it friendly.' },
    ])
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
      </aside>

      <div className="main-stage">
        <header className="glass-panel stage-header">
          <div>
            <p className="eyebrow">Campus Random Chat</p>
            <h2>{activeMatch ? `Connected with ${activeMatch.name}` : 'Ready to match'}</h2>
            <p className="muted">
              {activeMatch
                ? `${activeMatch.major} • ${activeMatch.year} • ${activeMatch.campus}`
                : 'Press "Find a Gopher" to start a video or text session.'}
            </p>
          </div>
          <div className="header-actions">
            <button className="ghost-btn ghost-btn--danger" type="button">
              Report
            </button>
            <button className="ghost-btn" type="button">
              Block
            </button>
            {activeMatch ? (
              <button className="ghost-btn" type="button" onClick={onEndMatch}>
                End
              </button>
            ) : null}
          </div>
        </header>

        <div className="video-grid">
          <div className="video-card glass-panel">
            <div className="video-feed">
              <div className="video-overlay">
                <span className="badge">You</span>
                <p>{session.user.displayName}</p>
              </div>
            </div>
          </div>
          <div className="video-card glass-panel">
            <div className={`video-feed ${activeMatch ? 'video-feed--live' : ''}`}>
              <div className="video-overlay">
                <span className="badge">{activeMatch ? 'Match' : 'Waiting'}</span>
                <p>{activeMatch ? activeMatch.name : 'Searching queue...'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bottom-grid">
          <section className="glass-panel info-panel">
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
          </section>

          <section className="glass-panel chat-panel">
            <div className="chat-log" aria-live="polite">
              {messages.map((message) => (
                <div key={message.id} className={`chat-row chat-row--${message.sender}`}>
                  <span className="chat-sender">{message.sender}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>

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
          </section>
        </div>
      </div>
    </section>
  )
}

export default CallScreen
