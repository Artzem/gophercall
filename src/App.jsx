import { useState } from 'react'
import './App.css'
import Login from './login.jsx'
import CallScreen from './callscreen.jsx'

function App() {
  const [session, setSession] = useState(null)

  const handleVerified = (profile) => {
    setSession({
      user: profile,
      verifiedAt: new Date().toISOString(),
      trustLabel: 'UMN email verified',
    })
  }

  const handleLogout = () => {
    setSession(null)
  }

  return (
    <main className="app-shell">
      {!session ? (
        <Login onVerified={handleVerified} />
      ) : (
        <CallScreen
          session={session}
          onLogout={handleLogout}
        />
      )}
    </main>
  )
}

export default App
