'use client'
// app/(dashboard)/connect/page.tsx
// ============================================================
// CONECTAR META ADS — Pantalla de conexión con guía paso a paso
// ============================================================

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface MetaConnection {
  meta_user_name: string
  connected_at: string
  token_expires_at: string
}

interface AdAccount {
  id: string
  account_id: string
  account_name: string
  currency: string
  account_status: number
  is_selected: boolean
}

interface Pixel {
  id: string
  pixel_id: string
  pixel_name: string
  is_selected: boolean
}

interface Page {
  id: string
  page_id: string
  page_name: string
  is_selected: boolean
}

const STEPS = [
  { n: 1, label: 'Conectar cuenta Meta' },
  { n: 2, label: 'Seleccionar Ad Account' },
  { n: 3, label: 'Seleccionar Pixel' },
  { n: 4, label: 'Seleccionar Página' },
  { n: 5, label: 'Listo para lanzar' },
]

export default function ConnectPage() {
  const supabase = createClient()
  const [step, setStep] = useState(1)
  const [connection, setConnection] = useState<MetaConnection | null>(null)
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([])
  const [pixels, setPixels] = useState<Pixel[]>([])
  const [pages, setPages] = useState<Page[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [selectedPixel, setSelectedPixel] = useState('')
  const [selectedPage, setSelectedPage] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    checkExistingConnection()
  }, [])

  async function checkExistingConnection() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: conn } = await supabase
      .from('meta_connections')
      .select('meta_user_name, connected_at, token_expires_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (conn) {
      setConnection(conn)
      await loadSavedAssets()
    }
  }

  async function loadSavedAssets() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: accounts }, { data: pxls }, { data: pgs }] = await Promise.all([
      supabase.from('ad_accounts').select('*').eq('user_id', user.id).order('account_name'),
      supabase.from('pixels').select('*').eq('user_id', user.id).order('pixel_name'),
      supabase.from('facebook_pages').select('*').eq('user_id', user.id).order('page_name'),
    ])

    if (accounts?.length) {
      setAdAccounts(accounts)
      const sel = accounts.find((a: AdAccount) => a.is_selected)
      if (sel) setSelectedAccount(sel.account_id)
      setStep(2)
    }
    if (pxls?.length) {
      setPixels(pxls)
      const sel = pxls.find((p: Pixel) => p.is_selected)
      if (sel) setSelectedPixel(sel.pixel_id)
      if (accounts?.length) setStep(3)
    }
    if (pgs?.length) {
      setPages(pgs)
      const sel = pgs.find((p: Page) => p.is_selected)
      if (sel) setSelectedPage(sel.page_id)
      if (accounts?.length && pxls?.length) setStep(4)
    }
    if (accounts?.length && pxls?.length && pgs?.length &&
        accounts.find((a: AdAccount) => a.is_selected) &&
        pxls.find((p: Pixel) => p.is_selected) &&
        pgs.find((pg: Page) => pg.is_selected)) {
      setStep(5)
    }
  }

  // ── Iniciar OAuth con Meta ────────────────────────────────
  function startMetaOAuth() {
    window.location.href = '/api/auth/meta'
  }

  // ── Sincronizar assets desde Meta ─────────────────────────
  async function syncFromMeta() {
    setSyncing(true)
    setError('')
    try {
      setLoadingStep('Obteniendo Ad Accounts...')
      const res = await fetch('/api/meta/ad-accounts')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAdAccounts(data.accounts)
      setStep(2)

      // Re-load pixels and pages too if they exist
      if (selectedAccount) await loadPixels(selectedAccount)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al sincronizar')
    } finally {
      setSyncing(false)
      setLoadingStep('')
    }
  }

  // ── Load pixels for selected ad account ───────────────────
  async function loadPixels(accountId: string) {
    setLoading(true)
    setLoadingStep('Cargando pixels...')
    setError('')
    try {
      const res = await fetch(`/api/meta/pixels?account_id=${accountId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPixels(data.pixels)
      setStep(3)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar pixels')
    } finally {
      setLoading(false)
      setLoadingStep('')
    }
  }

  // ── Load pages ─────────────────────────────────────────────
  async function loadPages() {
    setLoading(true)
    setLoadingStep('Cargando Facebook Pages...')
    setError('')
    try {
      const res = await fetch('/api/meta/pages')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPages(data.pages)
      setStep(4)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar páginas')
    } finally {
      setLoading(false)
      setLoadingStep('')
    }
  }

  // ── Save selections ────────────────────────────────────────
  async function saveAdAccount(accountId: string) {
    setSelectedAccount(accountId)
    await fetch('/api/meta/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'ad_account', id: accountId })
    })
    await loadPixels(accountId)
  }

  async function savePixel(pixelId: string) {
    setSelectedPixel(pixelId)
    await fetch('/api/meta/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pixel', id: pixelId })
    })
    await loadPages()
  }

  async function savePage(pageId: string) {
    setSelectedPage(pageId)
    await fetch('/api/meta/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'page', id: pageId })
    })
    setStep(5)
  }

  async function disconnectMeta() {
    if (!confirm('¿Seguro que quieres desconectar tu cuenta de Meta?')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('meta_connections').update({ is_active: false }).eq('user_id', user.id)
    setConnection(null)
    setAdAccounts([])
    setPixels([])
    setPages([])
    setStep(1)
  }

  const daysUntilExpiry = connection?.token_expires_at
    ? Math.floor((new Date(connection.token_expires_at).getTime() - Date.now()) / 86400000)
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 bg-gray-900 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-widest text-white">CONECTAR META ADS</h1>
          <p className="text-xs text-gray-500 mt-0.5">Configura tu cuenta publicitaria para lanzar campañas</p>
        </div>
        {connection && (
          <button onClick={syncFromMeta} disabled={syncing}
            className="btn-secondary text-xs flex items-center gap-2">
            {syncing ? '⟳ SINCRONIZANDO...' : '⟳ SINCRONIZAR'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Progress steps */}
        <div className="flex items-center gap-0 mb-8 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${
                step > s.n ? 'text-emerald-400' :
                step === s.n ? 'text-blue-400 bg-blue-500/10 border border-blue-500/30' :
                'text-gray-600'
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                  step > s.n ? 'bg-emerald-500 border-emerald-500 text-white' :
                  step === s.n ? 'border-blue-500 text-blue-400' :
                  'border-gray-700 text-gray-600'
                }`}>
                  {step > s.n ? '✓' : s.n}
                </span>
                {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px mx-1 ${step > s.n ? 'bg-emerald-600' : 'bg-gray-800'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 mb-5 flex gap-3">
            <span className="text-red-400 text-lg flex-shrink-0">⚠</span>
            <div>
              <div className="text-red-300 text-sm font-medium mb-0.5">Error</div>
              <div className="text-red-400 text-xs">{error}</div>
              <button onClick={() => setError('')} className="text-red-500 text-xs mt-1 hover:text-red-300">
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {(loading || syncing) && loadingStep && (
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 mb-5 flex items-center gap-3">
            <span className="text-blue-400 text-sm animate-spin">⟳</span>
            <span className="text-blue-300 text-xs">{loadingStep}</span>
          </div>
        )}

        {/* ── STEP 1: Connect Meta ──────────────────────────── */}
        <div className="card mb-4">
          <div className="card-title">
            Paso 1 — Conectar cuenta de Meta
            {connection && <span className="badge-success ml-2">CONECTADO</span>}
          </div>

          {!connection ? (
            <div>
              {/* Explanation */}
              <div className="bg-gray-800/50 rounded-lg p-4 mb-5 text-xs text-gray-400 space-y-2">
                <p className="text-gray-300 font-medium">¿Qué va a pasar?</p>
                <p>1. Se abrirá una ventana de Meta para que inicies sesión con tu cuenta de Facebook.</p>
                <p>2. Meta te pedirá autorizar los permisos necesarios para crear anuncios.</p>
                <p>3. Tu token se guardará encriptado — nosotros nunca vemos tu contraseña.</p>
                <p>4. Cada estudiante conecta su propia cuenta de forma independiente.</p>
              </div>

              {/* Permissions list */}
              <div className="mb-5">
                <p className="text-xs text-gray-500 mb-3 tracking-wider uppercase">Permisos que se solicitarán:</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { perm: 'ads_management', desc: 'Crear y gestionar anuncios' },
                    { perm: 'ads_read', desc: 'Leer datos de anuncios' },
                    { perm: 'pages_read_engagement', desc: 'Leer tus páginas de Facebook' },
                    { perm: 'business_management', desc: 'Acceso al Business Manager' },
                  ].map(item => (
                    <div key={item.perm} className="flex items-start gap-2 bg-gray-800 rounded-lg p-2.5">
                      <span className="text-blue-400 text-xs mt-0.5">✓</span>
                      <div>
                        <div className="text-[10px] text-blue-300 font-medium">{item.perm}</div>
                        <div className="text-[10px] text-gray-500">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={startMetaOAuth}
                className="btn-primary flex items-center gap-3 mx-auto">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                CONECTAR CON META ADS
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {connection.meta_user_name?.[0]?.toUpperCase() || 'M'}
                </div>
                <div>
                  <div className="text-sm text-white font-medium">{connection.meta_user_name}</div>
                  <div className="text-xs text-gray-500">
                    Conectado el {new Date(connection.connected_at).toLocaleDateString('es')}
                  </div>
                  {daysUntilExpiry !== null && (
                    <div className={`text-xs ${daysUntilExpiry < 10 ? 'text-amber-400' : 'text-gray-500'}`}>
                      Token válido por {daysUntilExpiry} días
                      {daysUntilExpiry < 10 && ' ⚠ Reconecta pronto'}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={disconnectMeta}
                className="text-xs text-red-500 hover:text-red-400 tracking-wide">
                DESCONECTAR
              </button>
            </div>
          )}
        </div>

        {/* ── STEP 2: Select Ad Account ─────────────────────── */}
        {connection && (
          <div className={`card mb-4 ${step < 2 ? 'opacity-50' : ''}`}>
            <div className="card-title">
              Paso 2 — Seleccionar Ad Account
              {selectedAccount && <span className="badge-success ml-2">SELECCIONADO</span>}
            </div>

            {adAccounts.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4">
                No se han cargado las Ad Accounts. Haz click en "Sincronizar" arriba.
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 mb-3">
                  Selecciona la cuenta publicitaria donde se crearán las campañas:
                </p>
                {adAccounts.map(acc => {
                  const isActive = acc.account_status === 1
                  return (
                    <button key={acc.account_id} onClick={() => saveAdAccount(acc.account_id)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                        selectedAccount === acc.account_id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                      }`}>
                      <div>
                        <div className="text-sm text-white">{acc.account_name}</div>
                        <div className="text-xs text-gray-500">act_{acc.account_id} · {acc.currency}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isActive
                          ? <span className="badge-success">ACTIVA</span>
                          : <span className="badge-failed">INACTIVA</span>
                        }
                        {selectedAccount === acc.account_id && (
                          <span className="text-blue-400 text-lg">✓</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Select Pixel ──────────────────────────── */}
        {connection && step >= 3 && (
          <div className={`card mb-4 ${step < 3 ? 'opacity-50' : ''}`}>
            <div className="card-title">
              Paso 3 — Seleccionar Pixel de Meta
              {selectedPixel && <span className="badge-success ml-2">SELECCIONADO</span>}
            </div>

            {pixels.length === 0 ? (
              <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-4 text-xs text-amber-300">
                <p className="font-medium mb-1">⚠ No se encontraron pixels en esta Ad Account</p>
                <p>Para crear un Pixel ve a Meta Events Manager → Conectar fuentes de datos → Web.</p>
                <a href="https://www.facebook.com/events_manager" target="_blank" rel="noopener"
                  className="text-blue-400 hover:text-blue-300 mt-2 inline-block">
                  Ir a Events Manager →
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 mb-3">
                  El pixel rastrea las conversiones de tus campañas:
                </p>
                {pixels.map(px => (
                  <button key={px.pixel_id} onClick={() => savePixel(px.pixel_id)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                      selectedPixel === px.pixel_id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                    }`}>
                    <div>
                      <div className="text-sm text-white">{px.pixel_name}</div>
                      <div className="text-xs text-gray-500">ID: {px.pixel_id}</div>
                    </div>
                    {selectedPixel === px.pixel_id && <span className="text-blue-400 text-lg">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Select Facebook Page ─────────────────── */}
        {connection && step >= 4 && (
          <div className={`card mb-4 ${step < 4 ? 'opacity-50' : ''}`}>
            <div className="card-title">
              Paso 4 — Seleccionar Facebook Page
              {selectedPage && <span className="badge-success ml-2">SELECCIONADA</span>}
            </div>

            {pages.length === 0 ? (
              <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-4 text-xs text-amber-300">
                <p className="font-medium mb-1">⚠ No se encontraron páginas de Facebook</p>
                <p>Necesitas ser administrador de al menos una página de Facebook.
                  Si ya tienes una, asegúrate de haber autorizado el permiso
                  <span className="text-white"> pages_read_engagement</span> al conectar Meta.</p>
                <button onClick={startMetaOAuth}
                  className="mt-2 text-blue-400 hover:text-blue-300">
                  Reconectar Meta con todos los permisos →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 mb-3">
                  Los anuncios se publicarán desde esta página:
                </p>
                {pages.map(pg => (
                  <button key={pg.page_id} onClick={() => savePage(pg.page_id)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                      selectedPage === pg.page_id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                    }`}>
                    <div>
                      <div className="text-sm text-white">{pg.page_name}</div>
                      <div className="text-xs text-gray-500">ID: {pg.page_id}</div>
                    </div>
                    {selectedPage === pg.page_id && <span className="text-blue-400 text-lg">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 5: All done ──────────────────────────────── */}
        {step === 5 && (
          <div className="card bg-emerald-900/10 border-emerald-700/40">
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✓</div>
              <h3 className="text-emerald-400 font-bold text-sm tracking-wider mb-2">
                TODO CONFIGURADO
              </h3>
              <p className="text-gray-400 text-xs mb-5">
                Tu cuenta de Meta Ads está conectada y lista para lanzar campañas ABO.
              </p>
              <div className="grid grid-cols-3 gap-3 mb-5 text-xs">
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-500 mb-1">AD ACCOUNT</div>
                  <div className="text-white font-medium truncate">
                    {adAccounts.find(a => a.account_id === selectedAccount)?.account_name || selectedAccount}
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-500 mb-1">PIXEL</div>
                  <div className="text-white font-medium truncate">
                    {pixels.find(p => p.pixel_id === selectedPixel)?.pixel_name || selectedPixel}
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-500 mb-1">PÁGINA</div>
                  <div className="text-white font-medium truncate">
                    {pages.find(p => p.page_id === selectedPage)?.page_name || selectedPage}
                  </div>
                </div>
              </div>
              <a href="/launch"
                className="btn-primary inline-flex items-center gap-2">
                ▶ IR AL ABO LAUNCHER
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
