import { useState } from 'react'
import allowedEmailDomains from './config/allowedEmailDomains.json'

function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

function getDomain(email) {
  const parts = normalizeEmail(email).split('@')
  return parts.length === 2 ? parts[1] : ''
}

function isAllowedDomain(email) {
  return allowedEmailDomains.domains.includes(getDomain(email))
}

function Login({ onVerified }) {
  const [form, setForm] = useState({
    email: '',
    code: '',
    displayName: '',
    agreeTerms: false,
  })
  const [step, setStep] = useState('email')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isTermsOpen, setIsTermsOpen] = useState(false)

  const onField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError('')
    setStatus('')
  }

  const requestCode = (event) => {
    event.preventDefault()
    const email = normalizeEmail(form.email)

    if (!email || !email.includes('@')) {
      setError('Enter a valid UMN email address.')
      return
    }

    if (!isAllowedDomain(email)) {
      setError('Only approved University of Minnesota email domains are allowed.')
      return
    }

    if (!form.agreeTerms) {
      setError('Please accept the Terms and Conditions before continuing.')
      return
    }

    setStatus(`Verification code sent to ${email} (demo mode).`)
    setStep('code')
  }

  const verifyCode = (event) => {
    event.preventDefault()
    const code = form.code.trim()
    const displayName = form.displayName.trim()

    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code.')
      return
    }

    if (code !== '123456') {
      setError('Invalid code in demo. Use 123456.')
      return
    }

    if (displayName.length < 2 || displayName.length > 24) {
      setError('Display name must be 2-24 characters.')
      return
    }

    onVerified({
      email: normalizeEmail(form.email),
      displayName,
    })
  }

  return (
    <section className="hero">
      <div className="hero__bg" aria-hidden="true" />
      <div className="hero__content">
        <div className="glass-panel">
          <header className="panel-header">
            <div>
              <p className="eyebrow">UMN-Only Random Chat</p>
              <h1>GopherCall</h1>
              <p className="subtitle">
                Modern campus chat/video matching for verified University of Minnesota students.
              </p>
            </div>
            <span className="badge badge--secure">Email Verified Access</span>
          </header>

          <div className="security-note" role="note">
            <strong>Security-first sign in:</strong> no password form in this demo. Real app should use UMN SSO or email OTP only.
          </div>

          {step === 'email' ? (
            <form className="auth-grid" onSubmit={requestCode} noValidate>
              <label>
                UMN email
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@umn.edu"
                  value={form.email}
                  onChange={(e) => onField('email', e.target.value)}
                  maxLength={120}
                />
              </label>

              <label>
                Display name
                <input
                  type="text"
                  placeholder="First name only"
                  value={form.displayName}
                  onChange={(e) => onField('displayName', e.target.value)}
                  maxLength={24}
                />
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.agreeTerms}
                  onChange={(e) => onField('agreeTerms', e.target.checked)}
                />
                <span>
                  I agree to the{' '}
                  <button
                    className="inline-link-btn"
                    type="button"
                    onClick={() => setIsTermsOpen(true)}
                  >
                    Terms and Conditions
                  </button>
                  .
                </span>
              </label>

              <button className="primary-btn" type="submit">
                Send Verification Code
              </button>
            </form>
          ) : (
            <form className="auth-grid" onSubmit={verifyCode} noValidate>
              <label>
                6-digit code
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="123456"
                  value={form.code}
                  onChange={(e) => onField('code', e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                />
              </label>

              <div className="inline-actions">
                <button className="primary-btn" type="submit">
                  Verify & Enter
                </button>
                <button className="ghost-btn" type="button" onClick={() => setStep('email')}>
                  Back
                </button>
              </div>
            </form>
          )}

          {status ? <p className="status status--ok">{status}</p> : null}
          {error ? <p className="status status--error">{error}</p> : null}

          <footer className="panel-footer">
            <div>
              Allowed domains:
              {' '}
              {allowedEmailDomains.domains.join(', ')}
            </div>
            <div>Demo code: 123456</div>
          </footer>
        </div>
      </div>

      {isTermsOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsTermsOpen(false)}>
          <div
            className="terms-modal glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="terms-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="terms-modal__header">
              <h2 id="terms-title">Terms and Conditions</h2>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => setIsTermsOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="terms-modal__body">
              <p>You must be at least 18 years old and currently use an approved University of Minnesota email address.</p>
              <p>Be respectful in every conversation. Harassment, hate speech, threats, doxxing, impersonation, and sexual coercion are not allowed.</p>
              <p>Do not record, screenshot, or share private conversations without clear consent from everyone involved.</p>
              <p>If you feel unsafe or see abuse, leave the call and report the behavior immediately.</p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default Login
