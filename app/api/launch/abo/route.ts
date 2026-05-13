import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptToken } from '@/lib/crypto'
import { generateCampaignName, generateAdSetName, generateAdName } from '@/lib/naming'
import { appendUTMs } from '@/lib/utm'

const META_BASE = 'https://graph.facebook.com/v20.0'

async function metaPost(path: string, token: string, body: Record<string, unknown>) {
  const form = new URLSearchParams()
  form.set('access_token', token)
  Object.entries(body).forEach(([k, v]) => form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v)))
  const res = await fetch(`${META_BASE}${path}`, { method: 'POST', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  const data = await res.json()
  if (data.error) throw { message: data.error.message, code: data.error.code, fbtrace: data.error.fbtrace_id }
  return data
}

async function metaGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${META_BASE}${path}`)
  url.searchParams.set('access_token', token)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  const data = await res.json()
  if (data.error) throw { message: data.error.message, code: data.error.code }
  return data
}

async function pollVideo(videoId: string, token: string): Promise<string> {
  for (let i = 0; i < 36; i++) {
    const r = await metaGet(`/${videoId}`, token, { fields: 'id,status' })
    if (r.status?.video_status === 'ready') return videoId
    if (r.status?.video_status === 'error') throw new Error(`Video ${videoId} falló`)
    await new Promise(r => setTimeout(r, 5000))
  }
  throw new Error('Video tardó demasiado')
}

function friendlyError(code: number, msg: string): string {
  const map: Record<number, string> = {
    190: '⚠️ Tu token de Meta expiró. Ve a Conectar Meta y reconecta tu cuenta.',
    200: '🔒 Permisos insuficientes. Reconecta tu cuenta de Meta.',
    100: `❌ Error en parámetro: ${msg}`,
    294: '⏱️ Meta está limitando las solicitudes. Espera 1 minuto e intenta de nuevo.',
    1815086: '💰 El presupuesto es menor al mínimo permitido por Meta.',
  }
  return map[code] || `Error Meta (${code}): ${msg}`
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const videos = formData.getAll('videos') as File[]
  const fields = JSON.parse(formData.get('fields') as string)

  if (!fields.productName) return NextResponse.json({ error: 'Falta el nombre del producto.' }, { status: 400 })
  if (videos.length === 0) return NextResponse.json({ error: 'Sube al menos un video.' }, { status: 400 })
  if (!fields.pageId) return NextResponse.json({ error: 'Selecciona una Facebook Page.' }, { status: 400 })

  const { data: conn } = await supabase.from('meta_connections').select('encrypted_token')
    .eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!conn) return NextResponse.json({ error: 'No hay cuenta Meta conectada.' }, { status: 400 })

  const token = decryptToken(conn.encrypted_token)
  const launchDate = new Date()
  const campaignName = generateCampaignName(fields.productName, fields.country, launchDate)
  const totalBudget = fields.dailyBudget * videos.length
  const accountId = fields.adAccountId.replace('act_', '')
  const isWA = fields.campaignType === 'WHATSAPP'

  // Extract WhatsApp phone number from wa.me URL
  const waPhone = isWA ? fields.destinationUrl.replace('https://wa.me/', '').replace(/[^0-9]/g, '') : ''
  const waMessage = isWA && fields.whatsappMessage ? encodeURIComponent(fields.whatsappMessage) : ''
  const waUrl = isWA ? `https://wa.me/${waPhone}${waMessage ? `?text=${waMessage}` : ''}` : ''

  const { data: launch } = await supabase.from('campaign_launches').insert({
    user_id: user.id, product_name: fields.productName, country: fields.country,
    destination_url: fields.destinationUrl, daily_budget_per_adset: fields.dailyBudget,
    conversion_event: isWA ? 'LEAD' : fields.conversionEvent,
    primary_text: fields.primaryText, headline: fields.headline,
    description: fields.description || null, cta_type: isWA ? 'WHATSAPP_MESSAGE' : fields.ctaType,
    age_min: fields.ageMin, age_max: fields.ageMax, gender: fields.gender,
    ad_account_id: fields.adAccountId, pixel_id: fields.pixelId || '0',
    page_id: fields.pageId, campaign_name: campaignName,
    total_daily_budget: totalBudget, video_count: videos.length, status: 'PROCESSING',
  }).select().single()

  if (!launch) return NextResponse.json({ error: 'Error al crear registro' }, { status: 500 })
  const launchId = launch.id

  const log = async (level: string, step: string, message: string) => {
    await supabase.from('launch_logs').insert({ launch_id: launchId, user_id: user.id, level, step, message })
  }

  try {
    await log('INFO', 'CREATE_CAMPAIGN', `Creando campaña: ${campaignName}`)
    const camp = await metaPost(`/act_${accountId}/campaigns`, token, {
      name: campaignName,
      objective: isWA ? 'OUTCOME_TRAFFIC' : 'OUTCOME_SALES',
      buying_type: 'AUCTION',
      status: 'PAUSED',
      special_ad_categories: JSON.stringify([]),
    })
    await supabase.from('campaign_launches').update({ meta_campaign_id: camp.id }).eq('id', launchId)
    await log('SUCCESS', 'CREATE_CAMPAIGN', `Campaña creada: ${camp.id}`)

    const results = []

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i]
      const videoName = video.name.replace(/\.[^.]+$/, '')
      const adSetName = generateAdSetName(i, videoName)
      const adName = generateAdName(i, videoName)
      const finalUrl = isWA ? waUrl : appendUTMs(fields.destinationUrl, campaignName, adName)

      // Subir video
      await log('INFO', `UPLOAD_VIDEO_${i+1}`, `Subiendo: ${video.name}`)
      const buf = Buffer.from(await video.arrayBuffer())
      const init = await metaPost(`/act_${accountId}/advideos`, token, {
        file_size: video.size, name: video.name, upload_phase: 'start',
      })
      await fetch(init.upload_url, {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${token}`,
          'file-size': String(video.size),
          'file-offset': '0',
          'Content-Type': 'application/octet-stream',
        },
        body: buf,
      })
      await metaPost(`/act_${accountId}/advideos`, token, { video_id: init.video_id, upload_phase: 'finish' })
      const videoId = await pollVideo(init.video_id, token)
      await log('SUCCESS', `UPLOAD_VIDEO_${i+1}`, `Video listo: ${videoId}`)

      // Crear Ad Set
      const genders = fields.gender === 'ALL' ? [1, 2] : fields.gender === 'MALE' ? [1] : [2]
      await log('INFO', `CREATE_ADSET_${i+1}`, `Creando: ${adSetName}`)

      const adSetBody: {[key: string]: unknown} = {
        name: adSetName,
        campaign_id: camp.id,
        daily_budget: Math.round(fields.dailyBudget * 100),
        billing_event: 'IMPRESSIONS',
        optimization_goal: isWA ? 'LINK_CLICKS' : 'OFFSITE_CONVERSIONS',
        targeting: JSON.stringify({
          geo_locations: { countries: [fields.country] },
          age_min: fields.ageMin,
          age_max: fields.ageMax,
          ...(genders.length < 2 ? { genders } : {}),
          publisher_platforms: ['facebook', 'instagram'],
          facebook_positions: ['feed', 'story', 'reels'],
          instagram_positions: ['stream', 'story', 'reels'],
          device_platforms: ['mobile', 'desktop'],
        }),
        status: 'PAUSED',
      }

      if (!isWA && fields.pixelId && fields.pixelId !== '0') {
        adSetBody.promoted_object = JSON.stringify({
          pixel_id: fields.pixelId,
          custom_event_type: fields.conversionEvent,
        })
        adSetBody.attribution_spec = JSON.stringify([{ event_type: 'CLICK_THROUGH', window_days: 7 }])
      }

      const adSet = await metaPost(`/act_${accountId}/adsets`, token, adSetBody)
      await log('SUCCESS', `CREATE_ADSET_${i+1}`, `Ad set: ${adSet.id}`)

      // Crear Creative con CTA correcto para WhatsApp vs Ventas
      const ctaValue = isWA
        ? { link: waUrl, whatsapp_phone_number: waPhone }
        : { link: finalUrl }

      const videoData = {
        video_id: videoId,
        message: fields.primaryText,
        title: fields.headline,
        call_to_action: {
          type: isWA ? 'WHATSAPP_MESSAGE' : fields.ctaType,
          value: ctaValue,
        },
      }
      if (fields.description) videoData.description = fields.description

      const creative = await metaPost(`/act_${accountId}/adcreatives`, token, {
        name: `CREATIVE_${String(i+1).padStart(2,'0')}_${videoName.toUpperCase().slice(0,20)}`,
        object_story_spec: JSON.stringify({ page_id: fields.pageId, video_data: videoData }),
      })
      await log('SUCCESS', `CREATE_CREATIVE_${i+1}`, `Creative: ${creative.id}`)

      // Crear Ad
      const adBody: {[key: string]: unknown} = {
        name: adName,
        adset_id: adSet.id,
        creative: JSON.stringify({ creative_id: creative.id }),
        status: 'PAUSED',
      }
      if (!isWA && fields.pixelId && fields.pixelId !== '0') {
        adBody.tracking_specs = JSON.stringify([{
          'action.type': ['offsite_conversion'],
          'fb.pixel': [fields.pixelId],
        }])
      }
      const ad = await metaPost(`/act_${accountId}/ads`, token, adBody)
      await log('SUCCESS', `CREATE_AD_${i+1}`, `Ad creado: ${ad.id}`)
      results.push({ videoName, adSetName, adName, adSetId: adSet.id, adId: ad.id, finalUrl })
    }

    await supabase.from('campaign_launches').update({
      status: 'SUCCESS', adsets_created: videos.length, ads_created: videos.length,
      completed_at: new Date().toISOString(),
    }).eq('id', launchId)
    await log('SUCCESS', 'DONE', `🎉 ${videos.length} ad sets creados en PAUSED.`)

    return NextResponse.json({
      success: true, launchId, campaignName,
      metaCampaignId: camp.id, adsCreated: videos.length,
      totalDailyBudget: totalBudget, results,
    })

  } catch (err) {
    const e = err as any
    const msg = e.code ? friendlyError(e.code, e.message) : (e.message || 'Error desconocido')
    await supabase.from('campaign_launches').update({ status: 'FAILED', error_message: msg }).eq('id', launchId)
    return NextResponse.json({ error: msg }, { status: 422 })
  }
}
