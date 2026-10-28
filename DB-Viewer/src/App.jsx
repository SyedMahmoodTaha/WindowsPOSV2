import { useState } from 'react'
import DbViewer from './DbViewer'

function App() {
  const [user, setUser] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)

  const signIn = async (event) => {
    event.preventDefault()
    setError('')
    if (!window.dbViewerApi) {
      setError('Open the DB Viewer desktop app to sign in.')
      return
    }

    setIsSigningIn(true)
    try {
      const account = await window.dbViewerApi.authenticate({ username, password })
      if (!account || account.role !== 'Admin') {
        setError('Admin sign-in failed. Check your credentials and try again.')
        return
      }
      setUser(account)
      setPassword('')
    } catch (signInError) {
      console.error('Admin sign-in failed:', signInError)
      setError(`Could not sign in: ${signInError.message}`)
    } finally {
      setIsSigningIn(false)
    }
  }

  const signOut = async () => {
    try {
      await window.dbViewerApi.signOut()
      setUser(null)
      setUsername('')
      setPassword('')
    } catch (signOutError) {
      console.error('Could not sign out:', signOutError)
      setError(`Could not sign out: ${signOutError.message}`)
    }
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#1f1f1f] px-4 py-8 text-[#f5f5f5]">
        <form onSubmit={signIn} className="w-full max-w-md rounded-[24px] bg-[#2a2a2a] p-8 shadow-2xl">
          <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Restricted access</p>
          <h1 className="mt-2 text-3xl font-semibold">PFL DB Viewer</h1>
          <p className="mt-3 text-sm text-[#ababab]">Sign in with the POS Admin account to access sales and database tools.</p>
          {error && <p role="alert" className="mt-5 rounded-[10px] border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
          <label className="mt-6 grid gap-2 text-sm text-[#d3d3d3]">
            Admin username
            <input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} className="rounded-[10px] border border-[#444] bg-[#1f1f1f] px-3 py-3 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
          </label>
          <label className="mt-4 grid gap-2 text-sm text-[#d3d3d3]">
            Password
            <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-[10px] border border-[#444] bg-[#1f1f1f] px-3 py-3 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
          </label>
          <button type="submit" disabled={isSigningIn} className="mt-6 w-full rounded-[10px] bg-[#d3d3d3] px-4 py-3 font-semibold text-[#1a1a1a] hover:bg-white disabled:cursor-wait disabled:opacity-60">
            {isSigningIn ? 'Signing in…' : 'Sign in as Admin'}
          </button>
        </form>
      </main>
    )
  }

  return <DbViewer onSignOut={signOut} />
}

export default App
