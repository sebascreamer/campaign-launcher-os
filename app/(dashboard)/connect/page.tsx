'use client'
// app/(dashboard)/connect/page.tsx - v2 with manual entry

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface MetaConnection {
  meta_user_name: string
  connected_at: string
  token_expires_at: string
}

export default function ConnectPage() {
  const supabase = createClient()
  const router = useRouter()
  const [connection, setConnection] = useState<MetaConnection | null>(null)
  const [loading, setLoading] = useState(true)

  // Manual entry state
  const [adAccountInput, setAdAccountInput] = useState('')
  const [pixelInput, setPixelInput] = useState('')
  const [pageInput, setPageInput] = useState('')

  // Saved state
  const [savedAccount, setSavedAccount] = useState('')
  const [savedPixel, setSavedPixel] = useState('')
  const [savedPage, setSavedPage] = useState('')

  // Pages from API
  const [pages, setPages] = useState<Array<{page_id: string; page_name: string}>>([])
  const [pixels, setPixels] = useState<Array<{pixel_id: string; pixel_name: string}>>([])

  // Status
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: conn }, { data: acc }, { data: pxls }, { data: pgs }] = await Promise.all([
      supabase.from('meta_connections').select('meta_user_name,connected_at,token_expires_at')
        .eq('user_id', user.id).eq('is_active', true).maybeSingle(),
      supabase.from('ad_accounts').select('account_id,account_name').eq('user_id', user.id).eq('is_selected', true).maybeSingle(),
      supabase.from('pixels').select('pixel_id,pixel_name').eq('user_id', user.id),
      supabase.from('facebook_pages').select('page_id,page_name').eq('user_id', user.id),
    ])

    if (conn) setConnection(conn)
    if (acc) { setSavedAccount(acc.account_id); setAdAccountInput(acc.account_id) }
    if (pxls?.length) { setPixels(pxls); const sel = pxls.find(p => p.pixel_id); if (sel) { setSavedPixel(sel.pixel_id); setPixelInput(sel.pixel_id) } }
    if (pgs?.length) { setPages(pgs); const sel = pgs.find(p => p.page_id); if (sel) { setSavedPage(sel.page_id); setPageInput(sel.page_id) } }
    setLoading(false)
  }

  function startMetaOAuth() {
    window.location.href = '/api/auth/meta'
  }

  async function verifyAndSaveAccount() {
    if (!adAccountInput.trim()) { setError('Ingresa tu Ad Account ID'); return }
    setVerifying(true); setError(''); setSuccess('')

    const cleanId = adAccountInput.replace('act_', '').trim()
    const res = await fetch(`/api/meta/verify-account?account_id=${cleanId}`)
    const data = await res.json()

    if (!res.ok || data.error) {
      setError(data.error || 'No se pudo verificar la cuenta. Verifica el ID.')
      setVerifying(false); return
    }

    setSavedAccount(cleanId)
    setSuccess(`✓ Ad Account verificada: ${data.name}`)

    // Load pixels for this account
    const pxRes = await fetch(`/api/meta/pixels?account_id=${cleanId}`)
    const pxData = await pxRes.json()
    if (pxData.pixels?.length) setPixels(pxData.pixels)

    // Load pages
    const pgRes = await fetch('/api/meta/pages')
    const pgData = await pgRes.json()
    if (pgData.pages?.length) setPages(pgData.pages)

    setVerifying(false)
  }

  async function savePixel() {
    if (!pixelInput.trim()) { setError('Ingresa el Pixel ID'); return }
    await fetch('/api/meta/select', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pixel', id: pixelInput.trim() })
    })
    setSavedPixel(pixelInput.trim())
    setSuccess('✓ Pixel guardado')
  }

  async function savePage(pageId: string) {
    await fetch('/api/meta/select', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'page', id: pageId })
    })
    setSavedPage(pageId)
    setSuccess('✓ Página guardada')
  }

  async function disconnectMeta() {
    if (!confirm('¿Desconectar tu cuenta de Meta?')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('meta_connections').update({ is_active: false }).eq('user_id', user.id)
    setConnection(null); setSavedAccount(''); setSavedPixel(''); setSavedPage('')
  }

  const allDone = savedAccount && savedPixel && savedPage
  const daysLeft = connection?.token_expires_at
    ? Math.floor((new Date(connection.token_expires_at).getTime() - Date.now()) / 86400000) : null

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#555',fontSize:'12px'}}>Cargando...</div>

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'16px 24px',borderBottom:'1px solid #1a1a1a',background:'#0A0A0A',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontSize:'13px',fontWeight:'bold',letterSpacing:'3px',color:'#fff',margin:0}}>CONECTAR META ADS</h1>
          <p style={{fontSize:'11px',color:'#444',marginTop:'3px'}}>Configura tu cuenta publicitaria para lanzar campañas</p>
        </div>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'24px'}}>
        {/* Error/Success */}
        {error && (
          <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'8px',padding:'12px 16px',marginBottom:'16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{color:'#f87171',fontSize:'12px'}}>{error}</span>
            <button onClick={() => setError('')} style={{background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:'16px'}}>×</button>
          </div>
        )}
        {success && (
          <div style={{background:'rgba(184,255,0,0.08)',border:'1px solid rgba(184,255,0,0.3)',borderRadius:'8px',padding:'12px 16px',marginBottom:'16px'}}>
            <span style={{color:'#B8FF00',fontSize:'12px'}}>{success}</span>
          </div>
        )}

        {/* STEP 1: Connect Meta */}
        <div style={{background:'#0A0A0A',border:'1px solid #1a1a1a',borderRadius:'12px',padding:'20px',marginBottom:'12px'}}>
          <div style={{fontSize:'10px',color:'#B8FF00',letterSpacing:'2px',fontWeight:'bold',marginBottom:'16px',display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{width:'6px',height:'6px',background:'#B8FF00',borderRadius:'50%',display:'inline-block'}}></span>
            PASO 1 — CONECTAR CUENTA DE META
            {connection && <span style={{background:'rgba(184,255,0,0.1)',border:'1px solid rgba(184,255,0,0.3)',color:'#B8FF00',fontSize:'9px',padding:'2px 8px',borderRadius:'4px',marginLeft:'4px'}}>CONECTADO</span>}
          </div>

          {!connection ? (
            <div>
              <p style={{fontSize:'12px',color:'#555',marginBottom:'16px',lineHeight:'1.6'}}>
                Conecta tu cuenta de Facebook para autorizar el acceso a Meta Ads.
              </p>
              <button onClick={startMetaOAuth} style={{display:'flex',alignItems:'center',gap:'10px',margin:'0 auto',padding:'12px 24px',background:'#1877F2',border:'none',color:'#fff',borderRadius:'8px',fontSize:'12px',fontWeight:'bold',cursor:'pointer',letterSpacing:'1px'}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                CONECTAR CON META ADS
              </button>
            </div>
          ) : (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                <div style={{width:'36px',height:'36px',background:'#1877F2',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:'bold',fontSize:'14px'}}>
                  {connection.meta_user_name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <div style={{fontSize:'13px',color:'#fff',fontWeight:'500'}}>{connection.meta_user_name}</div>
                  <div style={{fontSize:'11px',color:'#444'}}>Conectado el {new Date(connection.connected_at).toLocaleDateString('es')}</div>
                  {daysLeft !== null && <div style={{fontSize:'11px',color: daysLeft < 10 ? '#FFB400' : '#444'}}>Token válido por {daysLeft} días</div>}
                </div>
              </div>
              <button onClick={disconnectMeta} style={{fontSize:'11px',color:'#f87171',background:'none',border:'none',cursor:'pointer',letterSpacing:'1px'}}>DESCONECTAR</button>
            </div>
          )}
        </div>

        {/* STEP 2: Ad Account ID manual */}
        {connection && (
          <div style={{background:'#0A0A0A',border:'1px solid #1a1a1a',borderRadius:'12px',padding:'20px',marginBottom:'12px'}}>
            <div style={{fontSize:'10px',color:'#B8FF00',letterSpacing:'2px',fontWeight:'bold',marginBottom:'16px',display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{width:'6px',height:'6px',background:'#B8FF00',borderRadius:'50%',display:'inline-block'}}></span>
              PASO 2 — AD ACCOUNT ID
              {savedAccount && <span style={{background:'rgba(184,255,0,0.1)',border:'1px solid rgba(184,255,0,0.3)',color:'#B8FF00',fontSize:'9px',padding:'2px 8px',borderRadius:'4px',marginLeft:'4px'}}>GUARDADO</span>}
            </div>
            <p style={{fontSize:'12px',color:'#555',marginBottom:'12px',lineHeight:'1.6'}}>
              Encuentra tu Ad Account ID en <strong style={{color:'#aaa'}}>Meta Ads Manager</strong> → esquina superior izquierda → número que aparece bajo el nombre de tu cuenta. Ejemplo: <span style={{color:'#B8FF00',fontFamily:'monospace'}}>1690723562370291</span>
            </p>
            <div style={{display:'flex',gap:'8px'}}>
              <input
                value={adAccountInput}
                onChange={e => setAdAccountInput(e.target.value.replace('act_','').trim())}
                placeholder="Ej: 1690723562370291"
                style={{flex:1,background:'#111',border:'1px solid #222',color:'#fff',padding:'10px 12px',borderRadius:'8px',fontSize:'13px',fontFamily:'monospace',outline:'none'}}
              />
              <button onClick={verifyAndSaveAccount} disabled={verifying}
                style={{padding:'10px 20px',background:'#B8FF00',border:'none',color:'#000',borderRadius:'8px',fontSize:'11px',fontWeight:'bold',cursor:'pointer',letterSpacing:'1px',whiteSpace:'nowrap'}}>
                {verifying ? 'VERIFICANDO...' : 'VERIFICAR Y GUARDAR'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Pixel */}
        {connection && savedAccount && (
          <div style={{background:'#0A0A0A',border:'1px solid #1a1a1a',borderRadius:'12px',padding:'20px',marginBottom:'12px'}}>
            <div style={{fontSize:'10px',color:'#B8FF00',letterSpacing:'2px',fontWeight:'bold',marginBottom:'16px',display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{width:'6px',height:'6px',background:'#B8FF00',borderRadius:'50%',display:'inline-block'}}></span>
              PASO 3 — PIXEL ID
              {savedPixel && <span style={{background:'rgba(184,255,0,0.1)',border:'1px solid rgba(184,255,0,0.3)',color:'#B8FF00',fontSize:'9px',padding:'2px 8px',borderRadius:'4px',marginLeft:'4px'}}>GUARDADO</span>}
            </div>

            {pixels.length > 0 ? (
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                <p style={{fontSize:'12px',color:'#555',marginBottom:'4px'}}>Selecciona tu pixel:</p>
                {pixels.map(px => (
                  <button key={px.pixel_id} onClick={() => { setPixelInput(px.pixel_id); savePixel() }}
                    style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background: savedPixel === px.pixel_id ? 'rgba(184,255,0,0.08)' : '#111',border: savedPixel === px.pixel_id ? '1px solid rgba(184,255,0,0.4)' : '1px solid #222',borderRadius:'8px',cursor:'pointer',textAlign:'left'}}>
                    <div>
                      <div style={{fontSize:'12px',color:'#fff'}}>{px.pixel_name}</div>
                      <div style={{fontSize:'10px',color:'#555',fontFamily:'monospace'}}>ID: {px.pixel_id}</div>
                    </div>
                    {savedPixel === px.pixel_id && <span style={{color:'#B8FF00',fontSize:'16px'}}>✓</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <p style={{fontSize:'12px',color:'#555',marginBottom:'12px',lineHeight:'1.6'}}>
                  Ingresa tu Pixel ID manualmente. Lo encuentras en <strong style={{color:'#aaa'}}>Meta Events Manager</strong>.
                </p>
                <div style={{display:'flex',gap:'8px'}}>
                  <input value={pixelInput} onChange={e => setPixelInput(e.target.value.trim())}
                    placeholder="Ej: 1234567890123456"
                    style={{flex:1,background:'#111',border:'1px solid #222',color:'#fff',padding:'10px 12px',borderRadius:'8px',fontSize:'13px',fontFamily:'monospace',outline:'none'}} />
                  <button onClick={savePixel}
                    style={{padding:'10px 20px',background:'#B8FF00',border:'none',color:'#000',borderRadius:'8px',fontSize:'11px',fontWeight:'bold',cursor:'pointer',letterSpacing:'1px'}}>
                    GUARDAR
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Facebook Page */}
        {connection && savedAccount && savedPixel && (
          <div style={{background:'#0A0A0A',border:'1px solid #1a1a1a',borderRadius:'12px',padding:'20px',marginBottom:'12px'}}>
            <div style={{fontSize:'10px',color:'#B8FF00',letterSpacing:'2px',fontWeight:'bold',marginBottom:'16px',display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{width:'6px',height:'6px',background:'#B8FF00',borderRadius:'50%',display:'inline-block'}}></span>
              PASO 4 — FACEBOOK PAGE
              {savedPage && <span style={{background:'rgba(184,255,0,0.1)',border:'1px solid rgba(184,255,0,0.3)',color:'#B8FF00',fontSize:'9px',padding:'2px 8px',borderRadius:'4px',marginLeft:'4px'}}>GUARDADA</span>}
            </div>
            {pages.length > 0 ? (
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                {pages.map(pg => (
                  <button key={pg.page_id} onClick={() => savePage(pg.page_id)}
                    style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background: savedPage === pg.page_id ? 'rgba(184,255,0,0.08)' : '#111',border: savedPage === pg.page_id ? '1px solid rgba(184,255,0,0.4)' : '1px solid #222',borderRadius:'8px',cursor:'pointer',textAlign:'left'}}>
                    <div>
                      <div style={{fontSize:'12px',color:'#fff'}}>{pg.page_name}</div>
                      <div style={{fontSize:'10px',color:'#555',fontFamily:'monospace'}}>ID: {pg.page_id}</div>
                    </div>
                    {savedPage === pg.page_id && <span style={{color:'#B8FF00',fontSize:'16px'}}>✓</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <p style={{fontSize:'12px',color:'#555',marginBottom:'12px'}}>Ingresa tu Page ID manualmente:</p>
                <div style={{display:'flex',gap:'8px'}}>
                  <input value={pageInput} onChange={e => setPageInput(e.target.value.trim())}
                    placeholder="Ej: 123456789012345"
                    style={{flex:1,background:'#111',border:'1px solid #222',color:'#fff',padding:'10px 12px',borderRadius:'8px',fontSize:'13px',fontFamily:'monospace',outline:'none'}} />
                  <button onClick={() => savePage(pageInput)}
                    style={{padding:'10px 20px',background:'#B8FF00',border:'none',color:'#000',borderRadius:'8px',fontSize:'11px',fontWeight:'bold',cursor:'pointer',letterSpacing:'1px'}}>
                    GUARDAR
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ALL DONE */}
        {allDone && (
          <div style={{background:'rgba(184,255,0,0.05)',border:'1px solid rgba(184,255,0,0.3)',borderRadius:'12px',padding:'24px',textAlign:'center'}}>
            <div style={{fontSize:'40px',marginBottom:'12px'}}>✓</div>
            <h3 style={{color:'#B8FF00',fontWeight:'bold',fontSize:'14px',letterSpacing:'2px',marginBottom:'8px'}}>TODO CONFIGURADO</h3>
            <p style={{color:'#555',fontSize:'12px',marginBottom:'20px'}}>Tu cuenta está lista para lanzar campañas ABO.</p>
            <a href="/launch" style={{display:'inline-block',padding:'12px 28px',background:'#B8FF00',color:'#000',borderRadius:'8px',fontSize:'12px',fontWeight:'bold',letterSpacing:'2px',textDecoration:'none'}}>
              ▶ IR AL ABO LAUNCHER
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
