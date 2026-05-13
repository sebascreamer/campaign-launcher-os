'use client'
// app/(dashboard)/layout.tsx

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/',          label: 'Dashboard',    icon: '⬛' },
  { href: '/connect',   label: 'Conectar Meta', icon: '⚡' },
  { href: '/launch',    label: 'ABO Launcher',  icon: '▶' },
  { href: '/history',   label: 'Historial',     icon: '≡' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<{ email: string; name: string } | null>(null)
  const [metaConnected, setMetaConnected] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUser({
        email: user.email || '',
        name: user.user_metadata?.full_name || user.email || ''
      })
    })

    // Check Meta connection
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase
        .from('meta_connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()
      setMetaConnected(!!data)
    })
  }, [pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="p-4 border-b border-gray-800">
          <div className="text-blue-400 text-[9px] tracking-[3px] font-bold">CAMPAIGN</div>
          <div className="text-white text-sm font-bold tracking-widest">LAUNCHER OS</div>
          <div className="text-gray-600 text-[9px] tracking-wider mt-0.5">META ADS AUTOMATION</div>
        </div>

        {/* Meta connection status */}
        <div className="px-3 py-2 border-b border-gray-800">
          {metaConnected ? (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-emerald-900/20 rounded-lg border border-emerald-700/30">
              <span className="text-emerald-400 text-xs">●</span>
              <span className="text-emerald-400 text-[10px] tracking-wide">META CONECTADO</span>
            </div>
          ) : (
            <Link href="/connect">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-amber-900/20 rounded-lg border border-amber-700/30 cursor-pointer hover:bg-amber-900/30 transition-colors">
                <span className="text-amber-400 text-xs animate-pulse">●</span>
                <span className="text-amber-400 text-[10px] tracking-wide">CONECTAR META</span>
              </div>
            </Link>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3">
          {NAV.map(item => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-3 px-4 py-2.5 text-[11px] tracking-wide transition-all border-l-2 ${
                  active
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500'
                    : 'text-gray-500 border-transparent hover:text-gray-200 hover:bg-gray-800'
                }`}>
                  <span className="text-sm w-4 text-center">{item.icon}</span>
                  {item.label}
                </div>
              </Link>
            )
          })}

          {/* CBO - coming soon */}
          <div className="flex items-center gap-3 px-4 py-2.5 text-[11px] tracking-wide text-gray-700 border-l-2 border-transparent cursor-not-allowed">
            <span className="text-sm w-4 text-center">◈</span>
            CBO Scale
            <span className="text-[8px] bg-gray-800 text-gray-600 px-1.5 py-0.5 rounded ml-auto">PRONTO</span>
          </div>
        </nav>

        {/* User */}
        <div className="p-3 border-t border-gray-800">
          <div className="text-[9px] text-gray-600 tracking-wider mb-1">CONECTADO COMO</div>
          <div className="text-[10px] text-gray-400 truncate mb-2">{user?.email}</div>
          <button onClick={handleLogout}
            className="w-full text-[10px] text-gray-600 hover:text-red-400 tracking-wider transition-colors text-left">
            CERRAR SESIÓN →
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}
