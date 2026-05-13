'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

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
    ad: `AD_${String(i+1).padStart(2,'00')}_${sanitizeName(v.cleanName)}`,
  }))
  return { campaign, adsets }
}

export default function LaunchPage() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pixels, setPixels] = useState<Array<{pixel_id:string;pixel_name:string}>>([])
  const [pages, setPages] = useState<Array<{page_id:string;page_name:string}>>([])
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

  useEffect(() => { loadAssets() }, [])

  async function loadAssets() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: accs }, { data: pxls }, { data: pgs }] = await Promise.all([
      supabase.from('ad_accounts').select('*').eq('user_id', user.id).order('account_name'),
      supabase.from('pixels').select('*').eq('user_id', user.id).order('pixel_name'),
      supabase.from('facebook_pages').select('*').eq('user_id', user.id).order('page_name'),
    ])
    if (pxls?.length) setPixels(pxls)
    if (pgs?.length) setPages(pgs)

    // Auto-select saved values
    const selAcc = accs?.find(a => a.is_selected) || accs?.[0]
    const selPx = pxls?.find(p => p.is_selected) || pxls?.[0]
    const selPg = pgs?.find(p => p.is_selected) || pgs?.[0]
    if (selAcc) setForm(f => ({ ...f, adAccountId: selAcc.account_id }))
    if (selPx) setForm(f => ({ ...f, pixelId: selPx.pixel_id }))
    if (selPg) setForm(f => ({ ...f, pageId: selPg.page_id }))
  }

  function set(key: string, value: string) { setForm(f => ({ ...f, [key]: value })); setShowPreview(false) }

  function handleFiles(files: FileList | null) {
    if (!files) return
    const newVids: VideoFile[] = []
    for (const f of Array.from(files)) {
      if (videos.length + newVids.length >= 10) break
      if (!f.type.startsWith('video/')) { setError(`${f.name} no es un video.`); continue }
      if (f.size > 4 * 1024 * 1024 * 1024) { setError(`${f.name} supera 4GB.`); continue }
      newVids.push({ file: f, name: f.name, cleanName: f.name.replace(/\.[^.]+$/,''), size: (f.size/1024/1024).toFixed(1)+'MB' })
    }
    setVideos(v => [...v, ...newVids]); setShowPreview(false)
  }

  function removeVideo(i: number) { setVideos(v => v.filter((_, idx) => idx !== i)); setShowPreview(false) }

  function validate(): string {
    if (!form.productName.trim()) return 'Falta el nombre del producto.'
    if (!form.destinationUrl.trim()) return 'Falta la URL de destino.'
    try { new URL(form.destinationUrl) } catch { return 'La URL no es válida. Debe empezar con https://' }
    if (!form.adAccountId.trim()) return 'Ingresa tu Ad Account ID.'
    if (!form.pixelId.trim()) return 'Selecciona un Pixel.'
    if (!form.pageId.trim()) return 'Selecciona una Facebook Page.'
    if (videos.length === 0) return 'Sube al menos un video.'
    if (Number(form.dailyBudget) < 1) return 'El presupuesto mínimo es $1 USD.'
    if (!form.primaryText.trim()) return 'Falta el texto principal.'
    if (!form.headline.trim()) return 'Falta el titular.'
    return ''
  }

  const names = generateNames(form.productName, form.country, videos)
  const totalBudget = (Number(form.dailyBudget) * videos.length).toFixed(2)
  const finalUrl = form.destinationUrl ? `${form.destinationUrl}${form.destinationUrl.includes('?')?'&':'?'}utm_source=meta&utm_medium=paid&utm_campaign=${names.campaign.toLowerCase()}` : ''

  async function handleLaunch() {
    const err = validate()
    if (err) { setError(err); return }
    setError(''); setLaunching(true); setLogs([])
    const addLog = (level: string, msg: string) => {
      const time = new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
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
      gender: form.gender, adAccountId: form.adAccountId.replace('act_',''), pixelId: form.pixelId,
      pageId: form.pageId, igAccountId: form.igAccountId || undefined,
    }))
    const res = await fetch('/api/launch/abo', { method: 'POST', body: data })
    const result = await res.json()
    if (!res.ok) { addLog('ERROR', result.error || 'Error'); setError(result.error || 'Error.'); setLaunching(false); return }
    result.results?.forEach((r: {adSetName:string}) => addLog('SUCCESS', `✓ ${r.adSetName}`))
    addLog('SUCCESS', `🎉 "${result.campaignName}" creada. ${result.adsCreated} ad sets en PAUSED.`)
    setLaunchDone(true); setLaunching(false)
  }

  const cardStyle = { background:'#0A0A0A', border:'1px solid #1a1a1a', borderRadius:'12px', padding:'20px', marginBottom:'12px' }
  const titleStyle = { fontSize:'10px', color:'#B8FF00', letterSpacing:'2px', fontWeight:'bold', marginBottom:'16px' }
  const labelStyle = { display:'block', fontSize:'10px', color:'#555', marginBottom:'6px', letterSpacing:'1px', textTransform:'uppercase' as const }
  const inputStyle = { width:'100%', background:'#111', border:'1px solid #222', color:'#fff', padding:'10px 12px', borderRadius:'8px', fontSize:'13px', fontFamily:'inherit', outline:'none', boxSizing:'border-box' as const }
  const selectStyle = { ...inputStyle, cursor:'pointer' }

  if (launchDone) return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      <div style={{padding:'16px 24px',borderBottom:'1px solid #1a1a1a',background:'#0A0A0A'}}>
        <h1 style={{fontSize:'13px',fontWeight:'bold',letterSpacing:'3px',color:'#fff',margin:0}}>ABO LAUNCHER</h1>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'24px'}}>
        <div style={{...cardStyle,background:'rgba(184,255,0,0.05)',border:'1px solid rgba(184,255,0,0.3)',textAlign:'center',padding:'40px 20px'}}>
          <div style={{fontSize:'48px',marginBottom:'12px'}}>✓</div>
          <h2 style={{color:'#B8FF00',fontWeight:'bold',fontSize:'16px',letterSpacing:'2px',marginBottom:'8px'}}>¡CAMPAÑA CREADA!</h2>
          <p style={{color:'#555',fontSize:'12px',marginBottom:'24px'}}>Todos los ad sets están en PAUSED. Revisa en Meta Ads Manager y actívalos cuando estés listo.</p>
          <div style={{display:'flex',gap:'12px',justifyContent:'center'}}>
            <a href="https://adsmanager.facebook.com" target="_blank" style={{padding:'12px 24px',background:'#B8FF00',color:'#000',borderRadius:'8px',fontSize:'12px',fontWeight:'bold',letterSpacing:'2px',textDecoration:'none'}}>VER EN META ADS →</a>
            <button onClick={() => { setLaunchDone(false); setLogs([]); setVideos([]); setShowPreview(false) }} style={{padding:'12px 24px',background:'transparent',border:'1px solid #333',color:'#777',borderRadius:'8px',fontSize:'12px',cursor:'pointer'}}>NUEVO LANZAMIENTO</button>
          </div>
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>LOG DEL LANZAMIENTO</div>
          {logs.map((l, i) => (
            <div key={i} style={{display:'flex',gap:'12px',fontSize:'11px',padding:'4px 0',borderBottom:'1px solid #111',fontFamily:'monospace'}}>
              <span style={{color:'#333',flexShrink:0}}>{l.time}</span>
              <span style={{color:l.level==='SUCCESS'?'#B8FF00':l.level==='ERROR'?'#f87171':'#555',flexShrink:0,minWidth:'70px'}}>[{l.level}]</span>
              <span style={{color:'#666'}}>{l.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      <div style={{padding:'16px 24px',borderBottom:'1px solid #1a1a1a',background:'#0A0A0A',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontSize:'13px',fontWeight:'bold',letterSpacing:'3px',color:'#fff',margin:0}}>ABO TEST LAUNCHER</h1>
          <p style={{fontSize:'11px',color:'#444',marginTop:'3px',margin:0}}>1 video = 1 ad set = 1 ad · Todo queda en PAUSED</p>
        </div>
        {videos.length > 0 && form.productName && (
          <button onClick={() => setShowPreview(!showPreview)} style={{padding:'8px 16px',background:'transparent',border:'1px solid #333',color:'#777',borderRadius:'8px',fontSize:'11px',cursor:'pointer',letterSpacing:'1px'}}>
            {showPreview ? 'OCULTAR PREVIEW' : 'VER PREVIEW'}
          </button>
        )}
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'24px'}}>
        {error && (
          <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'8px',padding:'12px 16px',marginBottom:'16px',display:'flex',justifyContent:'space-between'}}>
            <span style={{color:'#f87171',fontSize:'12px'}}>{error}</span>
            <button onClick={() => setError('')} style={{background:'none',border:'none',color:'#f87171',cursor:'pointer'}}>×</button>
          </div>
        )}

        {/* Assets */}
        <div style={cardStyle}>
          <div style={titleStyle}>● ASSETS DE META ADS</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px'}}>
            <div>
              <label style={labelStyle}>Ad Account ID *</label>
              <input value={form.adAccountId} onChange={e => set('adAccountId', e.target.value.replace('act_','').trim())}
                style={inputStyle} placeholder="1690723562370291" />
              <div style={{fontSize:'10px',color:'#333',marginTop:'4px'}}>Solo el número, sin "act_"</div>
            </div>
            <div>
              <label style={labelStyle}>Pixel</label>
              <select value={form.pixelId} onChange={e => set('pixelId', e.target.value)} style={selectStyle}>
                <option value="">Selecciona...</option>
                {pixels.map(p => <option key={p.pixel_id} value={p.pixel_id}>{p.pixel_name}</option>)}
              </select>
              {pixels.length === 0 && <div style={{fontSize:'10px',color:'#333',marginTop:'4px'}}>No hay pixels. <a href="/connect" style={{color:'#B8FF00'}}>Ir a conectar →</a></div>}
            </div>
            <div>
              <label style={labelStyle}>Facebook Page</label>
              <select value={form.pageId} onChange={e => set('pageId', e.target.value)} style={selectStyle}>
                <option value="">Selecciona...</option>
                {pages.map(p => <option key={p.page_id} value={p.page_id}>{p.page_name}</option>)}
              </select>
              {pages.length === 0 && <div style={{fontSize:'10px',color:'#333',marginTop:'4px'}}>No hay páginas. <a href="/connect" style={{color:'#B8FF00'}}>Ir a conectar →</a></div>}
            </div>
          </div>
        </div>

        {/* Campaign */}
        <div style={cardStyle}>
          <div style={titleStyle}>● CAMPAÑA</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'12px'}}>
            <div><label style={labelStyle}>Nombre del producto *</label><input value={form.productName} onChange={e => set('productName', e.target.value)} style={inputStyle} placeholder="ECHOFREE" /></div>
            <div><label style={labelStyle}>País *</label>
              <select value={form.country} onChange={e => set('country', e.target.value)} style={selectStyle}>
                {[['MX','🇲🇽 México'],['US','🇺🇸 USA'],['CO','🇨🇴 Colombia'],['AR','🇦🇷 Argentina'],['CL','🇨🇱 Chile'],['PE','🇵🇪 Perú'],['ES','🇪🇸 España'],['BR','🇧🇷 Brasil']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div style={{marginBottom:'12px'}}><label style={labelStyle}>URL de destino *</label><input value={form.destinationUrl} onChange={e => set('destinationUrl', e.target.value)} style={inputStyle} placeholder="https://mitienda.com/producto" type="url" /></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px'}}>
            <div><label style={labelStyle}>Presupuesto/día por adset ($)</label><input value={form.dailyBudget} onChange={e => set('dailyBudget', e.target.value)} style={inputStyle} type="number" min="1" /></div>
            <div><label style={labelStyle}>Evento de conversión</label>
              <select value={form.conversionEvent} onChange={e => set('conversionEvent', e.target.value)} style={selectStyle}>
                {[['PURCHASE','Purchase'],['INITIATE_CHECKOUT','Initiate Checkout'],['LEAD','Lead'],['COMPLETE_REGISTRATION','Complete Registration'],['ADD_TO_CART','Add to Cart']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Call to Action</label>
              <select value={form.ctaType} onChange={e => set('ctaType', e.target.value)} style={selectStyle}>
                {[['SHOP_NOW','Shop Now'],['LEARN_MORE','Learn More'],['SIGN_UP','Sign Up'],['ORDER_NOW','Order Now'],['GET_OFFER','Get Offer']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Copy */}
        <div style={cardStyle}>
          <div style={titleStyle}>● COPY DEL ANUNCIO</div>
          <div style={{marginBottom:'12px'}}><label style={labelStyle}>Texto principal *</label><textarea value={form.primaryText} onChange={e => set('primaryText', e.target.value)} style={{...inputStyle,minHeight:'80px',resize:'vertical'}} placeholder="¿Cansado del ruido? Descubre EchoFree..." /></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
            <div><label style={labelStyle}>Titular *</label><input value={form.headline} onChange={e => set('headline', e.target.value)} style={inputStyle} placeholder="Duerme Sin Interrupciones" /></div>
            <div><label style={labelStyle}>Descripción (opcional)</label><input value={form.description} onChange={e => set('description', e.target.value)} style={inputStyle} placeholder="Envío gratis hoy" /></div>
          </div>
        </div>

        {/* Targeting */}
        <div style={cardStyle}>
          <div style={titleStyle}>● TARGETING</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px',marginBottom:'12px'}}>
            <div><label style={labelStyle}>Edad mínima</label><input value={form.ageMin} onChange={e => set('ageMin', e.target.value)} style={inputStyle} type="number" min="18" max="65" /></div>
            <div><label style={labelStyle}>Edad máxima</label><input value={form.ageMax} onChange={e => set('ageMax', e.target.value)} style={inputStyle} type="number" min="18" max="65" /></div>
            <div><label style={labelStyle}>Género</label>
              <select value={form.gender} onChange={e => set('gender', e.target.value)} style={selectStyle}>
                <option value="ALL">Todos</option><option value="MALE">Solo hombres</option><option value="FEMALE">Solo mujeres</option>
              </select>
            </div>
          </div>
          <div style={{background:'#111',borderRadius:'8px',padding:'10px 12px',fontSize:'11px',color:'#444'}}>✓ Advantage+ Placements activado — Meta optimiza entre Feed, Stories y Reels</div>
        </div>

        {/* Videos */}
        <div style={cardStyle}>
          <div style={titleStyle}>● VIDEOS — {videos.length}/10 <span style={{color:'#333',fontSize:'9px',fontWeight:'normal'}}>(1 VIDEO = 1 AD SET)</span></div>
          <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
            style={{border:'1px dashed #222',borderRadius:'12px',padding:'32px',textAlign:'center',cursor:'pointer',marginBottom:'12px'}}>
            <div style={{fontSize:'32px',marginBottom:'8px'}}>📹</div>
            <div style={{fontSize:'13px',color:'#444',marginBottom:'4px'}}>Arrastra los videos o haz click</div>
            <div style={{fontSize:'11px',color:'#333'}}>MP4, MOV, AVI · Máx 4GB · Hasta 10 videos</div>
          </div>
          <input ref={fileRef} type="file" multiple accept="video/*" style={{display:'none'}} onChange={e => handleFiles(e.target.files)} />
          {videos.map((v, i) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:'12px',background:'#111',borderRadius:'8px',padding:'10px 14px',marginBottom:'8px'}}>
              <span style={{fontSize:'18px'}}>🎬</span>
              <span style={{flex:1,fontSize:'12px',color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v.name}</span>
              <span style={{fontSize:'11px',color:'#444'}}>{v.size}</span>
              <button onClick={() => removeVideo(i)} style={{background:'none',border:'none',color:'#444',cursor:'pointer',fontSize:'16px',padding:'0 4px'}}>✕</button>
            </div>
          ))}
        </div>

        {/* Preview */}
        {showPreview && videos.length > 0 && form.productName && (
          <div style={{...cardStyle,border:'1px solid rgba(184,255,0,0.2)'}}>
            <div style={titleStyle}>● VISTA PREVIA</div>
            {[['Campaña',names.campaign],['Ad sets',String(videos.length)],['Presupuesto total/día',`$${totalBudget} USD`],['URL con UTMs',finalUrl.slice(0,70)+'...']].map(([k,v]) => (
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #111',fontSize:'12px'}}>
                <span style={{color:'#444'}}>{k}</span>
                <span style={{color:k==='Campaña'?'#B8FF00':k==='Presupuesto total/día'?'#B8FF00':'#fff',maxWidth:'60%',textAlign:'right',wordBreak:'break-all'}}>{v}</span>
              </div>
            ))}
            <div style={{marginTop:'12px',display:'flex',flexDirection:'column',gap:'6px'}}>
              {names.adsets.map((n, i) => (
                <div key={i} style={{display:'flex',alignItems:'center',gap:'12px',background:'#111',borderRadius:'6px',padding:'8px 12px',fontSize:'11px'}}>
                  <span style={{color:'#B8FF00',fontFamily:'monospace',minWidth:'24px'}}>{String(i+1).padStart(2,'0')}</span>
                  <span style={{color:'#fff',flex:1}}>{n.adset}</span>
                  <span style={{color:'#444'}}>{n.ad}</span>
                  <span style={{background:'rgba(255,180,0,0.1)',color:'#FFB400',border:'1px solid rgba(255,180,0,0.3)',fontSize:'9px',padding:'2px 6px',borderRadius:'4px'}}>PAUSED</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Launch button */}
        <button onClick={!showPreview && !launching ? () => { const e = validate(); if(e){setError(e);return;} setShowPreview(true) } : handleLaunch}
          disabled={launching}
          style={{width:'100%',padding:'16px',background: launching?'#222':'#B8FF00',border:'none',color:launching?'#555':'#000',borderRadius:'8px',fontSize:'13px',fontWeight:'bold',letterSpacing:'2px',cursor:launching?'not-allowed':'pointer',marginBottom:'12px'}}>
          {launching ? '⟳ CREANDO CAMPAÑA EN META...' : showPreview ? '▶ CONFIRMAR Y CREAR CAMPAÑA PAUSADA' : '→ VER PREVIEW ANTES DE LANZAR'}
        </button>

        {launching && logs.length > 0 && (
          <div style={cardStyle}>
            <div style={titleStyle}>● PROGRESO</div>
            <div style={{maxHeight:'200px',overflowY:'auto'}}>
              {logs.map((l, i) => (
                <div key={i} style={{display:'flex',gap:'12px',fontSize:'11px',padding:'3px 0',fontFamily:'monospace'}}>
                  <span style={{color:'#333',flexShrink:0}}>{l.time}</span>
                  <span style={{color:l.level==='SUCCESS'?'#B8FF00':l.level==='ERROR'?'#f87171':'#555',flexShrink:0}}>[{l.level}]</span>
                  <span style={{color:'#555'}}>{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
