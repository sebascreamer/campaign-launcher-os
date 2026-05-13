import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptToken } from '@/lib/crypto'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: conn } = await supabase
    .from('meta_connections').select('encrypted_token')
    .eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!conn) return NextResponse.json({ error: 'No hay cuenta Meta conectada' }, { status: 400 })

  try {
    const token = decryptToken(conn.encrypted_token)
    const allAccounts: Record<string, unknown>[] = []

    // 1. Personal ad accounts
    const personalRes = await fetch(
      `https://graph.facebook.com/v20.0/me/adaccounts?fields=id,name,currency,account_status,account_id&limit=50&access_token=${token}`
    )
    const personalData = await personalRes.json()
    if (personalData.data) allAccounts.push(...personalData.data)

    // 2. Business Manager ad accounts
    const bizRes = await fetch(
      `https://graph.facebook.com/v20.0/me/businesses?fields=id,name&limit=50&access_token=${token}`
    )
    const bizData = await bizRes.json()

    if (bizData.data?.length > 0) {
      for (const biz of bizData.data) {
        const ownedRes = await fetch(
          `https://graph.facebook.com/v20.0/${biz.id}/owned_ad_accounts?fields=id,name,currency,account_status,account_id&limit=50&access_token=${token}`
        )
        const ownedData = await ownedRes.json()
        if (ownedData.data) allAccounts.push(...ownedData.data)

        const clientRes = await fetch(
          `https://graph.facebook.com/v20.0/${biz.id}/client_ad_accounts?fields=id,name,currency,account_status,account_id&limit=50&access_token=${token}`
        )
        const clientData = await clientRes.json()
        if (clientData.data) allAccounts.push(...clientData.data)
      }
    }

    // Deduplicate by account_id
    const seen = new Set()
    const unique = allAccounts.filter((acc: Record<string, unknown>) => {
      if (seen.has(acc.account_id)) return false
      seen.add(acc.account_id)
      return true
    })

    if (unique.length > 0) {
      const rows = unique.map((acc: Record<string, unknown>) => ({
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
