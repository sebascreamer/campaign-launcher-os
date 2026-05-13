// app/api/meta/verify-account/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptToken } from '@/lib/crypto'

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: 'account_id requerido' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: conn } = await supabase.from('meta_connections')
    .select('encrypted_token').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!conn) return NextResponse.json({ error: 'No hay cuenta Meta conectada' }, { status: 400 })

  try {
    const token = decryptToken(conn.encrypted_token)
    const res = await fetch(
      `https://graph.facebook.com/v20.0/act_${accountId}?fields=id,name,currency,account_status,account_id&access_token=${token}`
    )
    const data = await res.json()

    if (data.error) {
      return NextResponse.json({
        error: `No se pudo acceder a la cuenta act_${accountId}. Verifica que el ID sea correcto y que tengas acceso.`
      }, { status: 422 })
    }

    // Save to DB
    await supabase.from('ad_accounts').upsert({
      user_id: user.id,
      account_id: data.account_id || accountId,
      account_name: data.name,
      currency: data.currency,
      account_status: data.account_status,
      is_selected: true,
      last_synced_at: new Date().toISOString(),
    }, { onConflict: 'user_id,account_id' })

    // Deselect others
    await supabase.from('ad_accounts')
      .update({ is_selected: false })
      .eq('user_id', user.id)
      .neq('account_id', data.account_id || accountId)

    return NextResponse.json({ success: true, name: data.name, currency: data.currency })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
