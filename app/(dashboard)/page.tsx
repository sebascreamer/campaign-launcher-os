'use client'
// app/(dashboard)/page.tsx

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface Launch {
  id: string
  campaign_name: string
  product_name: string
  country: string
  video_count: number
  total_daily_budget: number
  status: string
  created_at: string
  adsets_created: number
}

export default function DashboardPage() {
  const supabase = createClient()
  const [launches, setLaunches] = useState<Launch[]>([])
  const [metaConnected, setMetaConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ name: string } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) return

      setUser({ name: u.user_metadata?.full_name || u.email || '' })

      const [{ data: conn }, { data: l }] = await Promise.all([
        supabase.from('meta_connections').select('id').eq('user_id', u.id).eq('is_active', true).maybeSingle(),
        supabase.from('campaign_launches').select('*').eq('user_id', u.id)
          .order('created_at', { ascending: false }).limit(10),
      ])

      setMetaConnected(!!conn)
      setLaunches(l || [])
      setLoading(false)
    }
    load()
  }, [])

  const totalBudget = launches.filter(l => l.status === 'SUCCESS')
    .reduce((sum, l) => sum + Number(l.total_daily_budget), 0)
  const totalAds = launches.filter(l => l.status === 'SUCCESS')
    .reduce((sum, l) => sum + (l.adsets_created || 0), 0)

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      SUCCESS: 'badge-success', FAILED: 'badge-failed',
      PROCESSING: 'badge-processing', PENDING: 'badge-paused'
    }
    return map[status] || 'badge-paused'
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 bg-gray-900">
        <h1 className="text-sm font-bold tracking-widest text-white">DASHBOARD</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Bienvenido{user?.name ? `, ${user.name}` : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Alert if not connected */}
        {!loading && !metaConnected && (
          <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4 mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-amber-400 text-xl">⚡</span>
              <div>
                <div className="text-amber-300 font-medium text-sm">Conecta tu cuenta de Meta Ads</div>
                <div className="text-amber-500 text-xs mt-0.5">Necesitas conectar Meta antes de poder lanzar campañas</div>
              </div>
            </div>
            <Link href="/connect" className="btn-primary text-xs py-2 px-4">
              CONECTAR →
            </Link>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'LANZAMIENTOS', value: launches.length, sub: 'total' },
            { label: 'AD SETS CREADOS', value: totalAds, sub: 'en Meta Ads' },
            { label: 'PRESUPUESTO/DÍA', value: `$${totalBudget.toFixed(0)}`, sub: 'acumulado exitoso' },
          ].map(stat => (
            <div key={stat.label} className="card">
              <div className="text-[9px] text-gray-600 tracking-[2px] mb-2">{stat.label}</div>
              <div className="text-2xl font-bold text-white font-mono">{stat.value}</div>
              <div className="text-[10px] text-gray-600 mt-1">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Link href="/launch">
            <div className="card hover:border-blue-500/50 transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors">▶</div>
                <div>
                  <div className="text-sm font-bold text-white">Nuevo ABO Test</div>
                  <div className="text-xs text-gray-500">Lanzar campaña de testeo</div>
                </div>
              </div>
            </div>
          </Link>
          <Link href="/connect">
            <div className="card hover:border-gray-700 transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center text-gray-400 group-hover:bg-gray-700 transition-colors">⚡</div>
                <div>
                  <div className="text-sm font-bold text-white">
                    {metaConnected ? 'Gestionar Meta' : 'Conectar Meta Ads'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {metaConnected ? 'Ver conexión y assets' : 'Autorizar tu cuenta'}
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Recent launches */}
        <div className="card">
          <div className="card-title">Lanzamientos recientes</div>
          {loading ? (
            <div className="text-center py-8 text-gray-600 text-xs">Cargando...</div>
          ) : launches.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-700 text-2xl mb-2">▶</div>
              <div className="text-gray-500 text-sm">Aún no has lanzado ninguna campaña</div>
              <Link href="/launch" className="text-blue-400 text-xs hover:text-blue-300 mt-2 inline-block">
                Crear tu primera campaña →
              </Link>
            </div>
          ) : (
            <div className="space-y-0">
              <div className="grid grid-cols-[1fr,60px,80px,80px,70px] gap-2 px-3 py-1.5 text-[9px] text-gray-600 tracking-widest border-b border-gray-800">
                <span>CAMPAÑA</span>
                <span>ADS</span>
                <span>PRESUP/DÍA</span>
                <span>FECHA</span>
                <span>ESTADO</span>
              </div>
              {launches.map(l => (
                <div key={l.id} className="grid grid-cols-[1fr,60px,80px,80px,70px] gap-2 px-3 py-2.5 border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors items-center">
                  <div>
                    <div className="text-xs text-white font-medium truncate">{l.campaign_name || `${l.product_name} — ${l.country}`}</div>
                    <div className="text-[10px] text-gray-600">{l.product_name}</div>
                  </div>
                  <div className="text-xs text-gray-400">{l.adsets_created || l.video_count}</div>
                  <div className="text-xs text-gray-400">${Number(l.total_daily_budget || 0).toFixed(0)}</div>
                  <div className="text-[10px] text-gray-600">
                    {new Date(l.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                  </div>
                  <div><span className={statusBadge(l.status)}>{l.status}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
