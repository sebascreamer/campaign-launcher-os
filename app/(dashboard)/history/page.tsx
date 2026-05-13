'use client'
// app/(dashboard)/history/page.tsx

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Launch {
  id: string; campaign_name: string; product_name: string; country: string
  video_count: number; total_daily_budget: number; adsets_created: number
  status: string; created_at: string; meta_campaign_id: string
}
interface Log { level: string; step: string; message: string; created_at: string }

export default function HistoryPage() {
  const supabase = createClient()
  const [launches, setLaunches] = useState<Launch[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('campaign_launches')
      .select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setLaunches(data || [])
    setLoading(false)
  }

  async function loadLogs(id: string) {
    if (selected === id) { setSelected(null); setLogs([]); return }
    setSelected(id)
    const { data } = await supabase.from('launch_logs')
      .select('*').eq('launch_id', id).order('created_at')
    setLogs(data || [])
  }

  const badge = (s: string) => ({
    SUCCESS: 'badge-success', FAILED: 'badge-failed',
    PROCESSING: 'badge-processing', PENDING: 'badge-paused'
  }[s] || 'badge-paused')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 bg-gray-900">
        <h1 className="text-sm font-bold tracking-widest text-white">HISTORIAL DE LANZAMIENTOS</h1>
        <p className="text-xs text-gray-500 mt-0.5">Todas tus campañas creadas — haz click para ver el log</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-center py-16 text-gray-600 text-sm">Cargando...</div>
        ) : launches.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3 text-gray-700">≡</div>
            <div className="text-gray-500 text-sm">Aún no hay lanzamientos</div>
            <a href="/launch" className="text-blue-400 text-xs hover:text-blue-300 mt-2 inline-block">Crear primera campaña →</a>
          </div>
        ) : (
          <div className="space-y-3">
            {launches.map(l => (
              <div key={l.id} className="card cursor-pointer hover:border-gray-700 transition-colors"
                onClick={() => loadLogs(l.id)}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">
                      {l.campaign_name || l.product_name}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {l.product_name} · {l.country} ·{' '}
                      {new Date(l.created_at).toLocaleDateString('es', {day:'2-digit',month:'short',year:'numeric'})}
                    </div>
                  </div>
                  <span className={badge(l.status)}>{l.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="bg-gray-800 rounded-lg px-3 py-2">
                    <div className="text-gray-600 mb-0.5">AD SETS</div>
                    <div className="text-white font-medium">{l.adsets_created || l.video_count}</div>
                  </div>
                  <div className="bg-gray-800 rounded-lg px-3 py-2">
                    <div className="text-gray-600 mb-0.5">PRESUP/DÍA</div>
                    <div className="text-white font-medium">${Number(l.total_daily_budget||0).toFixed(0)} USD</div>
                  </div>
                  <div className="bg-gray-800 rounded-lg px-3 py-2">
                    <div className="text-gray-600 mb-0.5">ID META</div>
                    <div className="text-white font-medium font-mono text-[10px] truncate">{l.meta_campaign_id || '—'}</div>
                  </div>
                </div>
                {l.meta_campaign_id && (
                  <a href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${l.id}`}
                    target="_blank" rel="noopener"
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-blue-400 hover:text-blue-300 mt-2 inline-block">
                    Ver en Meta Ads Manager →
                  </a>
                )}
                {selected === l.id && logs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-800">
                    <div className="text-xs text-gray-600 mb-2 tracking-wider">LOG DE EJECUCIÓN</div>
                    <div className="space-y-0.5 font-mono max-h-48 overflow-y-auto">
                      {logs.map((log, i) => (
                        <div key={i} className="flex gap-3 text-xs py-0.5">
                          <span className="text-gray-700 flex-shrink-0 min-w-[56px]">
                            {new Date(log.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
                          </span>
                          <span className={log.level==='SUCCESS'?'text-emerald-400':log.level==='ERROR'?'text-red-400':'text-blue-400'} style={{flexShrink:0,minWidth:'56px'}}>
                            [{log.level}]
                          </span>
                          <span className="text-gray-400">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
