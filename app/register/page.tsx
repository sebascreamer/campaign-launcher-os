'use client'
// app/register/page.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const supabase = createClient()

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name } }
    })
    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm text-center">
        <div className="text-4xl mb-4">✓</div>
        <h2 className="text-white font-bold mb-2">¡Cuenta creada!</h2>
        <p className="text-gray-400 text-sm mb-6">Revisa tu email para confirmar tu cuenta, luego inicia sesión.</p>
        <Link href="/login" className="btn-primary inline-block">IR AL LOGIN</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-blue-400 text-xs tracking-[4px] font-bold mb-1">CAMPAIGN</div>
          <div className="text-white text-xl font-bold tracking-widest">LAUNCHER OS</div>
        </div>
        <div className="card">
          <h1 className="text-sm font-bold text-gray-200 mb-5 tracking-wider">CREAR CUENTA</h1>
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Nombre completo</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="input-field" placeholder="Tu nombre" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input-field" placeholder="tu@email.com" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Contraseña</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input-field" placeholder="Mínimo 6 caracteres" minLength={6} required />
            </div>
            {error && (
              <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-red-400 text-xs">{error}</div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? '⟳ CREANDO...' : 'CREAR CUENTA →'}
            </button>
          </form>
          <p className="text-center text-xs text-gray-600 mt-4">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300">Inicia sesión</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
