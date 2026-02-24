import { useState } from 'react'
import './App.css'
import Login from './login.jsx'
import CallScreen from './callscreen.jsx'

function App() {
  const [session, setSession] = useState(null)
  const [activeMatch, setActiveMatch] = useState(null)

  const handleVerified = (profile) => {
    setSession({
      user: profile,
      verifiedAt: new Date().toISOString(),
      trustLabel: 'UMN email verified',
    })
  }

  const handleStartMatch = () => {
    if (!session) {
      return
    }

    const sampleMatches = [
      {
        id: 'm1',
        name: 'Avery',
        major: 'Computer Science',
        year: 'Junior',
        campus: 'Twin Cities',
        vibe: ['study buddy', 'hackathons', 'startup ideas'],
        bio: 'Building side projects and looking for chill people to talk product + classes.',
      },
      {
        id: 'm2',
        name: 'Maya',
        major: 'Design',
        year: 'Senior',
        campus: 'Twin Cities',
        vibe: ['UX', 'music', 'coffee walks'],
        bio: 'Design systems nerd. Down for casual chats and collab brainstorming.',
      },
      {
        id: 'm3',
        name: 'Noah',
        major: 'Mechanical Engineering',
        year: 'Sophomore',
        campus: 'Twin Cities',
        vibe: ['robotics', 'gym', '3D printing'],
        bio: 'Can talk prototyping for hours. Also accepting finals-week coping strategies.',
      },
    ]

    const next = sampleMatches[Math.floor(Math.random() * sampleMatches.length)]
    setActiveMatch(next)
  }

  const handleEndMatch = () => {
    setActiveMatch(null)
  }

  const handleLogout = () => {
    setActiveMatch(null)
    setSession(null)
  }

  return (
    <main className="app-shell">
      {!session ? (
        <Login onVerified={handleVerified} />
      ) : (
        <CallScreen
          session={session}
          activeMatch={activeMatch}
          onStartMatch={handleStartMatch}
          onEndMatch={handleEndMatch}
          onLogout={handleLogout}
        />
      )}
    </main>
  )
}

export default App
