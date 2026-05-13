'use client'
// app/(dashboard)/launch/page.tsx

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Asset { id: string; name: string; value: string }
interface VideoFile { file: File; name: string; cleanName: string; size: string }

function sanitizeName(str: string) {
  return str.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[^.]+$/, '').replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_')
    .replace(/^_|_$/g, '').slice(0, 30)
}

function generateNames(product: string, country: string, videos: VideoFile[]) {
  const d = new Date()
  const date = `${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getFullYear()).slice(2)}`
  const prod = sanitizeName(product)
  const campaign = `ABO_TEST_${prod}_${country}_${date}`
  const adsets = videos.map((v, i) => ({
    adset: `ADSET_${String(i+1).padStart(2,'0')}_${sanitizeName(v.cleanName)}`,
    ad: `AD_${String(i+1).padStart(2,'0')}_${sanitizeName(v.cleanName)}`,
  }))
  return { campaign, adsets }
}

export default function LaunchPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [adAccounts, setAdAccounts] = useState<Asset[]>([])
  const [pixels, setPixels] = useState<Asset[]>([])
  const [pages, setPages] = useState<Asset[]>([])
  const [videos, setVideos] = useState<VideoFile[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [logs, setLogs] = useState<Array<{level:string;msg:string;time:string}>>([])
  const [launchDone, setLaunchDone] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    productName: '', country: 'MX', destinationUrl: '',
    dailyBudget: '10', conversionEvent: 'PURCHASE',
    primaryText: '', headline: '', description: '',
    ctaType: 'SHOP_NOW', ageMin: '18', ageMax: '65', gender: 'ALL',
    adAccountId: '', pixelId: '', pageId: '', igAccountId: '',
  })

  useEffect(() => {
    loadAssets()
  }, [])

  async function loadAssets() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: accs }, { data: pxls }, { data: pgs }] = await Promise.all([
      supabase.from('ad_accounts').select('account_id,account_name').eq('user_id', user.id),
      supabase.from('pixels').select('pixel_id,pixel_name').eq('user_id', user.id),
      supabase.from('facebook_pages').select('page_id,page_name').eq('user_id', user.id),
    ])
    setAdAccounts((accs||[]).map(a => ({ id: a.account_id, name: a.account_name, value: a.account_id })))
    setPixels((pxls||[]).map(p => ({ id: p.pixel_id, name: p.pixel_name, value: p.pixel_id })))
    setPages((pgs||[]).map(p => ({ id: p.page_id, name: p.page_name, value: p.page_id })))

    // Auto-select if only one
    const selAcc = (accs||[]).find((a: {is_selected?: boolean}) => a.is_selected) || accs?.[0]
    const selPx = (pxls||[]).find((p: {is_selected?: boolean}) => p.is_selected) || pxls?.[0]
    const selPg = (pgs||[]).find((p: {is_selected?: boolean}) => p.is_selected) || pgs?.[0]
    if (selAcc) setForm(f => ({ ...f, adAccountId: selAcc.account_id }))
    if (selPx) setForm(f => ({ ...f, pixelId: selPx.pixel_id }))
    if (selPg) setForm(f => ({ ...f, pageId: selPg.page_id }))
  }

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    setShowPreview(false)
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    const newVids: VideoFile[] = []
    for (const f of Array.from(files)) {
      if (videos.length + newVids.length >= 10) break
      if (!f.type.startsWith('video/')) { setError(`${f.name} no es un video. Solo MP4, MOV o AVI.`); continue }
      if (f.size > 4 * 1024 * 1024 * 1024) { setError(`${f.name} supera 4GB.`); continue }
      newVids.push({ file: f, name: f.name, cleanName: f.name.replace(/\.[^.]+$/,''), size: (f.size/1024/1024).toFixed(1)+'MB' })
    }
    setVideos(v => [...v, ...newVids])
    setShowPreview(false)
  }

  function removeVideo(i: number) {
    setVideos(v => v.filter((_, idx) => idx !== i))
    setShowPreview(false)
  }

  function validate(): string {
    if (!form.productName.trim()) return 'Falta el nombre del producto.'
    if (!form.destinationUrl.trim()) return 'Falta la URL de destino.'
    try { new URL(form.destinationUrl) } catch { return 'La URL no es válida. Debe empezar con https://' }
    if (!form.adAccountId) return 'Selecciona un Ad Account. Si no aparece ninguno, ve a Conectar Meta.'
    if (!form.pixelId) return 'Selecciona un Pixel.'
    if (!form.pageId) return 'Selecciona una Facebook Page.'
    if (videos.length === 0) return 'Sube al menos un video.'
    if (Number(form.dailyBudget) < 1) return 'El presupuesto mínimo es $1 USD por ad set.'
    if (!form.primaryText.trim()) return 'Falta el texto principal del anuncio.'
    if (!form.headline.trim()) return 'Falta el titular del anuncio.'
    return ''
  }

  const names = generateNames(form.productName, form.country, videos)
  const totalBudget = (Number(form.dailyBudget) * videos.length).toFixed(2)
  const finalUrl = form.destinationUrl
    ? `${form.destinationUrl}${form.destinationUrl.includes('?') ? '&' : '?'}utm_source=meta&utm_medium=paid&utm_campaign=${names.campaign.toLowerCase()}`
    : ''

  async function handleLaunch() {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setLaunching(true)
    setLogs([])

    const addLog = (level: string, msg: string) => {
      const time = new Date().toLocaleTimeString('es', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
      setLogs(l => [...l, {level, msg, time}])
    }

    addLog('INFO', 'Preparando lanzamiento...')

    const data = new FormData()
    videos.forEach(v => data.append('videos', v.file))
    data.append('fields', JSON.stringify({
      productName: form.productName, country: form.country,
      destinationUrl: form.destinationUrl, dailyBudget: Number(form.dailyBudget),
      conversionEvent: form.conversionEvent, primaryText: form.primaryText,
      headline: form.headline, description: form.description,
      ctaType: form.ctaType, ageMin: Number(form.ageMin), ageMax: Number(form.ageMax),
      gender: form.gender, adAccountId: form.adAccountId, pixelId: form.pixelId,
      pageId: form.pageId, igAccountId: form.igAccountId || undefined,
    }))

    const res = await fetch('/api/launch/abo', { method: 'POST', body: data })
    const result = await res.json()

    if (!res.ok) {
      addLog('ERROR', result.error || 'Error desconocido')
      setError(result.error || 'Hubo un error al crear la campaña.')
      setLaunching(false)
      return
    }

    result.results?.forEach((r: {adSetName:string;adId:string}) => {
      addLog('SUCCESS', `✓ Creado: ${r.adSetName}`)
    })
    addLog('SUCCESS', `🎉 Campaña "${result.campaignName}" creada en Meta. ${result.adsCreated} ad sets en PAUSED.`)
    setLaunchDone(true)
    setLaunching(false)
  }

  if (launchDone) return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 bg-gray-900">
        <h1 className="text-sm font-bold tracking-widest text-white">ABO LAUNCHER</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="card bg-emerald-900/10 border-emerald-700/40 text-center py-8 mb-5">
          <div className="text-5xl mb-3">✓</div>
          <h2 className="text-emerald-400 font-bold text-lg tracking-wider mb-2">¡CAMPAÑA CREADA!</h2>
          <p className="text-gray-400 text-sm mb-1">Todos los ad sets están en <span className="badge-paused inline-block">PAUSED</span></p>
          <p className="text-gray-500 text-xs mb-6">Revisa en Meta Ads Manager, actívalos cuando estés listo.</p>
          <div className="flex gap-3 justify-center">
            <a href="https://adsmanager.facebook.com" target="_blank"
              className="btn-primary text-xs py-2 px-5">VER EN META ADS →</a>
            <button onClick={() => { setLaunchDone(false); setLogs([]); setVideos([]); setShowPreview(false) }}
              className="btn-secondary text-xs">NUEVO LANZAMIENTO</button>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Log del lanzamiento</div>
          <div className="space-y-0.5 font-mono">
            {logs.map((l, i) => (
              <div key={i} className="flex gap-3 text-xs py-1 border-b border-gray-800/50">
                <span className="text-gray-600 flex-shrink-0">{l.time}</span>
                <span className={l.level === 'SUCCESS' ? 'text-emerald-400' : l.level === 'ERROR' ? 'text-red-400' : 'text-blue-400'} style={{flexShrink:0,minWidth:'64px'}}>[{l.level}]</span>
                <span className="text-gray-400">{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 bg-gray-900 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-widest text-white">ABO TEST LAUNCHER</h1>
          <p className="text-xs text-gray-500 mt-0.5">1 video = 1 ad set = 1 ad · Todo queda en PAUSED</p>
        </div>
        {videos.length > 0 && form.productName && (
          <button onClick={() => setShowPreview(!showPreview)}
            className="btn-secondary text-xs">
            {showPreview ? 'OCULTAR PREVIEW' : 'VER PREVIEW'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {error && (
          <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 flex gap-3">
            <span className="text-red-400 text-lg flex-shrink-0">⚠</span>
            <div className="flex-1">
              <div className="text-red-300 text-sm font-medium">Error</div>
              <div className="text-red-400 text-xs mt-0.5">{error}</div>
            </div>
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-400 text-lg">×</button>
          </div>
        )}

        {/* Assets */}
        <div className="card">
          <div className="card-title">Assets de Meta Ads</div>
          {adAccounts.length === 0 && (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 text-xs text-amber-300 mb-3">
              No hay assets cargados. Ve a{' '}
              <a href="/connect" className="underline">Conectar Meta</a> primero.
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Ad Account</label>
              <select value={form.adAccountId} onChange={e => set('adAccountId', e.target.value)} className="select-field">
                <option value="">Selecciona...</option>
                {adAccounts.map(a => <option key={a.id} value={a.value}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Pixel</label>
              <select value={form.pixelId} onChange={e => set('pixelId', e.target.value)} className="select-field">
                <option value="">Selecciona...</option>
                {pixels.map(p => <option key={p.id} value={p.value}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Facebook Page</label>
              <select value={form.pageId} onChange={e => set('pageId', e.target.value)} className="select-field">
                <option value="">Selecciona...</option>
                {pages.map(p => <option key={p.id} value={p.value}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Campaign config */}
        <div className="card">
          <div className="card-title">Campaña</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Nombre del producto *</label>
              <input value={form.productName} onChange={e => set('productName', e.target.value)}
                className="input-field" placeholder="ECHOFREE" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">País *</label>
              <select value={form.country} onChange={e => set('country', e.target.value)} className="select-field">
                {[['MX','🇲🇽 México'],['US','🇺🇸 USA'],['CO','🇨🇴 Colombia'],['AR','🇦🇷 Argentina'],['CL','🇨🇱 Chile'],['PE','🇵🇪 Perú'],['ES','🇪🇸 España'],['BR','🇧🇷 Brasil']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">URL de destino *</label>
            <input value={form.destinationUrl} onChange={e => set('destinationUrl', e.target.value)}
              className="input-field" placeholder="https://mitienda.com/producto" type="url" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Presupuesto/día por adset ($) *</label>
              <input value={form.dailyBudget} onChange={e => set('dailyBudget', e.target.value)}
                className="input-field" type="number" min="1" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Evento de conversión</label>
              <select value={form.conversionEvent} onChange={e => set('conversionEvent', e.target.value)} className="select-field">
                {[['PURCHASE','Purchase'],['INITIATE_CHECKOUT','Initiate Checkout'],['LEAD','Lead'],['COMPLETE_REGISTRATION','Complete Registration'],['ADD_TO_CART','Add to Cart']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Call to Action</label>
              <select value={form.ctaType} onChange={e => set('ctaType', e.target.value)} className="select-field">
                {[['SHOP_NOW','Shop Now'],['LEARN_MORE','Learn More'],['SIGN_UP','Sign Up'],['ORDER_NOW','Order Now'],['GET_OFFER','Get Offer'],['CONTACT_US','Contact Us']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Copy */}
        <div className="card">
          <div className="card-title">Copy del anuncio</div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Texto principal (primary text) *</label>
            <textarea value={form.primaryText} onChange={e => set('primaryText', e.target.value)}
              className="input-field" rows={3} placeholder="¿Cansado del ruido? Descubre EchoFree y duerme por fin en silencio..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Titular (headline) *</label>
              <input value={form.headline} onChange={e => set('headline', e.target.value)}
                className="input-field" placeholder="Duerme Sin Interrupciones" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Descripción (opcional)</label>
              <input value={form.description} onChange={e => set('description', e.target.value)}
                className="input-field" placeholder="Envío gratis hoy" />
            </div>
          </div>
        </div>

        {/* Targeting */}
        <div className="card">
          <div className="card-title">Targeting</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Edad mínima</label>
              <input value={form.ageMin} onChange={e => set('ageMin', e.target.value)}
                className="input-field" type="number" min="18" max="65" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Edad máxima</label>
              <input value={form.ageMax} onChange={e => set('ageMax', e.target.value)}
                className="input-field" type="number" min="18" max="65" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 tracking-wider uppercase">Género</label>
              <select value={form.gender} onChange={e => set('gender', e.target.value)} className="select-field">
                <option value="ALL">Todos</option>
                <option value="MALE">Solo hombres</option>
                <option value="FEMALE">Solo mujeres</option>
              </select>
            </div>
          </div>
          <div className="bg-gray-800/50 rounded-lg px-3 py-2 text-xs text-gray-500">
            ✓ Advantage+ Placements — Meta optimiza entre Feed, Stories, Reels automáticamente
          </div>
        </div>

        {/* Videos */}
        <div className="card">
          <div className="card-title">
            Videos
            <span className="text-gray-600 text-xs font-normal ml-1">— {videos.length}/10 subidos</span>
          </div>
          <div
            className="border border-dashed border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-500/5 transition-all mb-3"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='#3b82f6' }}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
          >
            <div className="text-3xl mb-2">📹</div>
            <div className="text-sm text-gray-400 mb-1">Arrastra los videos aquí o haz click</div>
            <div className="text-xs text-gray-600">MP4, MOV, AVI · Máx 4GB por video · Hasta 10 videos</div>
          </div>
          <input ref={fileRef} type="file" multiple accept="video/*" className="hidden"
            onChange={e => handleFiles(e.target.files)} />
          {videos.length > 0 && (
            <div className="space-y-2">
              {videos.map((v, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-lg">🎬</span>
                  <span className="flex-1 text-xs text-white truncate">{v.name}</span>
                  <span className="text-xs text-gray-500">{v.size}</span>
                  <button onClick={() => removeVideo(i)} className="text-gray-600 hover:text-red-400 text-sm transition-colors">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview */}
        {showPreview && videos.length > 0 && form.productName && (
          <div className="card border-blue-800/50">
            <div className="card-title">Vista previa — revisa antes de lanzar</div>
            <div className="space-y-2 mb-4">
              {[
                ['Nombre de campaña', names.campaign, 'text-blue-400'],
                ['Ad sets a crear', String(videos.length), ''],
                ['Presupuesto total / día', `$${totalBudget} USD`, 'text-emerald-400'],
                ['URL con UTMs', finalUrl.length > 60 ? finalUrl.slice(0,60)+'...' : finalUrl, 'text-xs'],
                ['Estado inicial de todo', 'PAUSED', ''],
              ].map(([k, v, cls]) => (
                <div key={k} className="flex justify-between items-center py-2 border-b border-gray-800 text-xs">
                  <span className="text-gray-500">{k}</span>
                  <span className={`font-medium ${cls} max-w-xs text-right break-all`}>{k === 'Estado inicial de todo' ? <span className="badge-paused">{v}</span> : v}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              {names.adsets.map((n, i) => (
                <div key={i} className="flex items-center gap-3 text-xs bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-blue-400 font-mono min-w-[20px]">{String(i+1).padStart(2,'0')}</span>
                  <span className="text-white flex-1">{n.adset}</span>
                  <span className="text-gray-500">{n.ad}</span>
                  <span className="badge-paused">PAUSED</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Launch button */}
        <button
          onClick={!showPreview && !launching ? () => { const e = validate(); if (e) { setError(e); return; } setShowPreview(true) } : handleLaunch}
          disabled={launching}
          className="btn-primary w-full text-base py-4"
        >
          {launching ? '⟳ CREANDO CAMPAÑA EN META...' :
           showPreview ? '▶ CONFIRMAR Y CREAR CAMPAÑA PAUSADA EN META ADS' :
           '→ VER PREVIEW ANTES DE LANZAR'}
        </button>

        {/* Live log during launch */}
        {launching && logs.length > 0 && (
          <div className="card">
            <div className="card-title">Creando campaña...</div>
            <div className="space-y-0.5 font-mono max-h-48 overflow-y-auto">
              {logs.map((l, i) => (
                <div key={i} className="flex gap-3 text-xs py-1">
                  <span className="text-gray-600 flex-shrink-0">{l.time}</span>
                  <span className={l.level==='SUCCESS'?'text-emerald-400':l.level==='ERROR'?'text-red-400':'text-blue-400'} style={{flexShrink:0,minWidth:'64px'}}>[{l.level}]</span>
                  <span className="text-gray-400">{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
