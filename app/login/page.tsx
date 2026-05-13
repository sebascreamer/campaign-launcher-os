'use client'
// app/login/page.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Email o contraseña incorrectos.'
        : error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-blue-400 text-xs tracking-[4px] font-bold mb-1">CAMPAIGN</div>
          <div className="text-white text-xl font-bold tracking-widest">LAUNCHER OS</div>
          <div className="text-gray-600 text-xs mt-1 tracking-wider">META ADS AUTOMATION</div>
        </div>

        <div className="card">
          <h1 className="text-sm font-bold text-gray-200 mb-5 tracking-wider">INICIAR SESIÓN</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input-field" placeholder="tu@email.com" required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Contraseña</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input-field" placeholder="••••••••" required
              />
            </div>
            {error && (
              <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-red-400 text-xs">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? '⟳ ENTRANDO...' : 'ENTRAR →'}
            </button>
          </form>
          <p className="text-center text-xs text-gray-600 mt-4">
            ¿No tienes cuenta?{' '}
            <Link href="/register" className="text-blue-400 hover:text-blue-300">Regístrate</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
