// app/api/meta/ad-accounts/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptToken } from '@/lib/crypto'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: conn } = await supabase
    .from('meta_connections')
    .select('encrypted_token')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!conn) return NextResponse.json({ error: 'No hay cuenta Meta conectada' }, { status: 400 })

  try {
    const token = decryptToken(conn.encrypted_token)
    const res = await fetch(
      `https://graph.facebook.com/v20.0/me/adaccounts?fields=id,name,currency,account_status,account_id&limit=50&access_token=${token}`
    )
    const data = await res.json()

    if (data.error) {
      const msgs: Record<number, string> = {
        190: '⚠️ Tu token de Meta expiró. Ve a "Conectar Meta" y reconecta tu cuenta.',
        200: '🔒 Permisos insuficientes. Reconecta tu cuenta aceptando todos los permisos.',
      }
      return NextResponse.json({
        error: msgs[data.error.code] || `Error Meta (${data.error.code}): ${data.error.message}`
      }, { status: 422 })
    }

    // Cache in Supabase
    if (data.data?.length) {
      const rows = data.data.map((acc: {
        account_id: string; name: string; currency: string; account_status: number
      }) => ({
        user_id: user.id,
        account_id: acc.account_id,
        account_name: acc.name,
        currency: acc.currency,
        account_status: acc.account_status,
        last_synced_at: new Date().toISOString(),
      }))
      await supabase.from('ad_accounts').upsert(rows, { onConflict: 'user_id,account_id' })
    }

    const { data: accounts } = await supabase
      .from('ad_accounts').select('*').eq('user_id', user.id).order('account_name')
    return NextResponse.json({ accounts: accounts || [] })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
