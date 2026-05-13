// app/api/launch/abo/route.ts
// ============================================================
// ABO Test Campaign Launch — Main Orchestrator
// POST /api/launch/abo
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { decryptToken } from '@/lib/crypto';
import { generateCampaignName, generateAdSetName, generateAdName } from '@/lib/naming';
import { appendUTMs } from '@/lib/utm';
import { validateABOForm } from '@/lib/validators';
import { createCampaign } from '@/lib/meta/campaign';
import { uploadVideoToMeta } from '@/lib/meta/video';
import { createAdSet } from '@/lib/meta/adset';
import { createAdCreative } from '@/lib/meta/creative';
import { createAd } from '@/lib/meta/ad';
import { MetaAPIError } from '@/lib/meta/client';

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse multipart form (videos + JSON fields)
  const formData = await req.formData();
  const videos = formData.getAll('videos') as File[];
  const fields = JSON.parse(formData.get('fields') as string);

  // 3. Validate inputs
  const validation = validateABOForm(fields, videos);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.errors }, { status: 400 });
  }

  // 4. Get access token (decrypted)
  const { data: connection } = await supabase
    .from('meta_connections')
    .select('encrypted_token')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (!connection) {
    return NextResponse.json({
      error: 'No hay cuenta Meta conectada. Por favor conecta tu cuenta primero.'
    }, { status: 400 });
  }

  const accessToken = decryptToken(connection.encrypted_token);

  // 5. Generate naming
  const launchDate = new Date();
  const campaignName = generateCampaignName(fields.productName, fields.country, launchDate);
  const finalUrl = appendUTMs(fields.destinationUrl, campaignName, '');
  const totalBudget = fields.dailyBudget * videos.length;

  // 6. Create launch record in DB
  const { data: launch, error: launchError } = await supabase
    .from('campaign_launches')
    .insert({
      user_id: user.id,
      product_name: fields.productName,
      country: fields.country,
      destination_url: fields.destinationUrl,
      daily_budget_per_adset: fields.dailyBudget,
      conversion_event: fields.conversionEvent,
      primary_text: fields.primaryText,
      headline: fields.headline,
      description: fields.description || null,
      cta_type: fields.ctaType,
      age_min: fields.ageMin,
      age_max: fields.ageMax,
      gender: fields.gender,
      ad_account_id: fields.adAccountId,
      pixel_id: fields.pixelId,
      page_id: fields.pageId,
      ig_account_id: fields.igAccountId || null,
      campaign_name: campaignName,
      total_daily_budget: totalBudget,
      final_url_with_utms: finalUrl,
      video_count: videos.length,
      status: 'PROCESSING',
    })
    .select()
    .single();

  if (launchError || !launch) {
    return NextResponse.json({ error: 'Error al crear el registro de lanzamiento' }, { status: 500 });
  }

  const launchId = launch.id;

  // Helper: log step
  async function log(level: string, step: string, message: string, payload?: object) {
    await supabase.from('launch_logs').insert({
      launch_id: launchId,
      user_id: user.id,
      level,
      step,
      message,
      payload: payload || null,
    });
  }

  // Helper: handle fatal error
  async function fail(message: string, metaError?: MetaAPIError) {
    await supabase.from('campaign_launches').update({
      status: 'FAILED',
      error_message: message,
    }).eq('id', launchId);

    if (metaError) {
      await supabase.from('error_log').insert({
        user_id: user.id,
        launch_id: launchId,
        error_type: metaError.type,
        error_message: metaError.message,
        meta_error_code: metaError.code,
        meta_fbtrace_id: metaError.fbtraceId,
      });
    }
  }

  try {
    // ── STEP 1: Create Campaign ────────────────────────────────
    await log('INFO', 'CREATE_CAMPAIGN', `Creando campaña: ${campaignName}`);

    const campaign = await createCampaign({
      accountId: fields.adAccountId.replace('act_', ''),
      accessToken,
      campaignName,
      status: 'PAUSED',
    });

    await supabase.from('campaign_launches').update({
      meta_campaign_id: campaign.id,
    }).eq('id', launchId);

    await log('SUCCESS', 'CREATE_CAMPAIGN', `Campaña creada con ID: ${campaign.id}`, { campaignId: campaign.id });

    // ── STEP 2: Process each video ─────────────────────────────
    let adsCreated = 0;
    const results = [];

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const videoName = video.name.replace(/\.[^.]+$/, ''); // Remove extension
      const adSetName = generateAdSetName(i, videoName);
      const adName = generateAdName(i, videoName);
      const finalAdUrl = appendUTMs(fields.destinationUrl, campaignName, adName);

      // Create video record in DB
      const { data: videoRecord } = await supabase.from('uploaded_videos').insert({
        launch_id: launchId,
        user_id: user.id,
        original_filename: video.name,
        file_size_bytes: video.size,
        mime_type: video.type,
        adset_name: adSetName,
        ad_name: adName,
        sort_order: i,
        upload_status: 'uploading',
      }).select().single();

      // ── 2a: Upload video to Meta
      await log('INFO', `UPLOAD_VIDEO_${i + 1}`, `Subiendo video: ${video.name}`);
      const videoBuffer = Buffer.from(await video.arrayBuffer());

      const metaVideoId = await uploadVideoToMeta({
        accountId: fields.adAccountId.replace('act_', ''),
        accessToken,
        videoBuffer,
        fileName: video.name,
        fileSize: video.size,
      });

      await supabase.from('uploaded_videos').update({
        meta_video_id: metaVideoId,
        upload_status: 'processing',
      }).eq('id', videoRecord?.id);

      await log('SUCCESS', `UPLOAD_VIDEO_${i + 1}`, `Video subido y listo: ${metaVideoId}`);

      // ── 2b: Create Ad Set
      await log('INFO', `CREATE_ADSET_${i + 1}`, `Creando ad set: ${adSetName}`);

      const genders = fields.gender === 'ALL' ? [1, 2]
        : fields.gender === 'MALE' ? [1] : [2];

      const adSet = await createAdSet({
        accountId: fields.adAccountId.replace('act_', ''),
        accessToken,
        campaignId: campaign.id,
        adSetName,
        dailyBudgetCents: Math.round(fields.dailyBudget * 100),
        pixelId: fields.pixelId,
        conversionEvent: fields.conversionEvent,
        country: fields.country,
        ageMin: fields.ageMin,
        ageMax: fields.ageMax,
        genders,
        status: 'PAUSED',
      });

      await supabase.from('uploaded_videos').update({
        meta_adset_id: adSet.id,
        upload_status: 'creating_creative',
      }).eq('id', videoRecord?.id);

      await log('SUCCESS', `CREATE_ADSET_${i + 1}`, `Ad set creado: ${adSet.id}`);

      // ── 2c: Create Creative
      await log('INFO', `CREATE_CREATIVE_${i + 1}`, `Creando creative para: ${adSetName}`);

      const creative = await createAdCreative({
        accountId: fields.adAccountId.replace('act_', ''),
        accessToken,
        creativeName: `CREATIVE_${String(i + 1).padStart(2, '0')}_${videoName.toUpperCase()}`,
        pageId: fields.pageId,
        videoId: metaVideoId,
        primaryText: fields.primaryText,
        headline: fields.headline,
        description: fields.description,
        ctaType: fields.ctaType,
        destinationUrl: finalAdUrl,
        igAccountId: fields.igAccountId,
      });

      await supabase.from('uploaded_videos').update({
        meta_creative_id: creative.id,
        upload_status: 'creating_ad',
      }).eq('id', videoRecord?.id);

      await log('SUCCESS', `CREATE_CREATIVE_${i + 1}`, `Creative creado: ${creative.id}`);

      // ── 2d: Create Ad
      await log('INFO', `CREATE_AD_${i + 1}`, `Creando anuncio: ${adName}`);

      const ad = await createAd({
        accountId: fields.adAccountId.replace('act_', ''),
        accessToken,
        adName,
        adSetId: adSet.id,
        creativeId: creative.id,
        pixelId: fields.pixelId,
        status: 'PAUSED',
      });

      await supabase.from('uploaded_videos').update({
        meta_ad_id: ad.id,
        upload_status: 'ready',
        uploaded_at: new Date().toISOString(),
      }).eq('id', videoRecord?.id);

      await log('SUCCESS', `CREATE_AD_${i + 1}`, `Anuncio creado: ${ad.id}`);

      adsCreated++;
      results.push({
        videoName,
        adSetName,
        adName,
        metaVideoId,
        adSetId: adSet.id,
        creativeId: creative.id,
        adId: ad.id,
        finalUrl: finalAdUrl,
      });
    }

    // ── STEP 3: Mark launch as successful ─────────────────────
    await supabase.from('campaign_launches').update({
      status: 'SUCCESS',
      adsets_created: adsCreated,
      ads_created: adsCreated,
      completed_at: new Date().toISOString(),
    }).eq('id', launchId);

    await log('SUCCESS', 'LAUNCH_COMPLETE', `🎉 Campaña creada exitosamente. ${adsCreated} ad sets creados, todos en PAUSED.`);

    return NextResponse.json({
      success: true,
      launchId,
      campaignName,
      metaCampaignId: campaign.id,
      adsCreated,
      totalDailyBudget: totalBudget,
      results,
    });

  } catch (err) {
    if (err instanceof MetaAPIError) {
      const friendlyMessage = getMetaErrorMessage(err.code, err.message);
      await fail(friendlyMessage, err);
      return NextResponse.json({ error: friendlyMessage, code: err.code }, { status: 422 });
    }

    const msg = err instanceof Error ? err.message : 'Error desconocido';
    await fail(msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Human-friendly Meta error messages ─────────────────────
function getMetaErrorMessage(code: number, original: string): string {
  const messages: Record<number, string> = {
    190: '⚠️ Tu token de Meta ha expirado. Ve a Configuración y reconecta tu cuenta.',
    100: `❌ Parámetro inválido en la solicitud a Meta: ${original}`,
    200: '🔒 Permisos insuficientes. Asegúrate de autorizar ads_management al conectar Meta.',
    294: '⏱️ Meta está limitando las solicitudes. Espera 1 minuto e intenta de nuevo.',
    1487390: '❌ El Pixel seleccionado no está disponible en esta Ad Account. Verifica en Eventos Manager.',
    1487534: '❌ La Página o cuenta de Instagram no está conectada a este Ad Account.',
    1815086: '💰 El presupuesto diario es menor al mínimo permitido por Meta para este país.',
    2446076: '🎬 Hay un problema con uno de los videos. Verifica que sea MP4/MOV y menor a 4GB.',
  };
  return messages[code] || `Error de Meta Ads (código ${code}): ${original}`;
}


// ============================================================
// lib/validators.ts
// ============================================================
export function validateABOForm(fields: Record<string, unknown>, videos: File[]) {
  const errors: string[] = [];

  if (!fields.productName) errors.push('El nombre del producto es requerido.');
  if (!fields.country) errors.push('El país es requerido.');

  // URL validation
  try {
    new URL(fields.destinationUrl as string);
  } catch {
    errors.push('La URL de destino no es válida. Debe incluir https://');
  }

  // Budget validation
  const budget = Number(fields.dailyBudget);
  if (!budget || budget < 1) errors.push('El presupuesto diario mínimo es $1 USD por ad set.');
  if (budget > 50000) errors.push('El presupuesto máximo por ad set es $50,000 USD.');

  if (!fields.pixelId) errors.push('Debes seleccionar un Pixel.');
  if (!fields.pageId) errors.push('Debes seleccionar una Facebook Page.');

  // Video validation
  if (videos.length === 0) errors.push('Debes subir al menos 1 video.');
  if (videos.length > 10) errors.push('Máximo 10 videos por lanzamiento.');

  const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/avi', 'video/x-m4v'];
  const MAX_SIZE = 4 * 1024 * 1024 * 1024; // 4GB

  videos.forEach((v, i) => {
    if (!ALLOWED_TYPES.includes(v.type)) {
      errors.push(`Video ${i + 1} (${v.name}): formato no permitido. Usa MP4, MOV o AVI.`);
    }
    if (v.size > MAX_SIZE) {
      errors.push(`Video ${i + 1} (${v.name}): supera el límite de 4GB.`);
    }
  });

  return { valid: errors.length === 0, errors };
}


// ============================================================
// lib/naming.ts
// ============================================================
import { format } from 'date-fns';

export function generateCampaignName(producto: string, pais: string, fecha: Date): string {
  const dateStr = format(fecha, 'ddMMyy');
  const prod = sanitizeName(producto);
  const country = pais.toUpperCase().slice(0, 3);
  return `ABO_TEST_${prod}_${country}_${dateStr}`;
}

export function generateAdSetName(index: number, videoName: string): string {
  const num = String(index + 1).padStart(2, '0');
  const name = sanitizeName(videoName);
  return `ADSET_${num}_${name}`;
}

export function generateAdName(index: number, videoName: string): string {
  const num = String(index + 1).padStart(2, '0');
  const name = sanitizeName(videoName);
  return `AD_${num}_${name}`;
}

function sanitizeName(str: string): string {
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')     // Remove accents
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}


// ============================================================
// lib/utm.ts
// ============================================================
export function appendUTMs(baseUrl: string, campaignName: string, adName: string): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('utm_source', 'meta');
    url.searchParams.set('utm_medium', 'paid');
    url.searchParams.set('utm_campaign', campaignName.toLowerCase());
    if (adName) url.searchParams.set('utm_content', adName.toLowerCase());
    return url.toString();
  } catch {
    return baseUrl;
  }
}


// ============================================================
// lib/crypto.ts
// AES-256-GCM encryption for Meta tokens
// ============================================================
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64'); // 32-byte key

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

export function decryptToken(encryptedData: string): string {
  const [ivHex, tagHex, encryptedHex] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
