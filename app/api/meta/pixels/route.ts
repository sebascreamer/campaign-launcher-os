// app/api/meta/pixels/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptToken } from '@/lib/crypto'

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: 'account_id requerido' }, { status: 400 })

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
      `https://graph.facebook.com/v20.0/act_${accountId}/adspixels?fields=id,name&limit=50&access_token=${token}`
    )
    const data = await res.json()
    if (data.error) {
      return NextResponse.json({ error: `Error Meta: ${data.error.message}` }, { status: 422 })
    }

    if (data.data?.length) {
      const rows = data.data.map((px: { id: string; name: string }) => ({
        user_id: user.id,
        pixel_id: px.id,
        pixel_name: px.name,
        last_synced_at: new Date().toISOString(),
      }))
      await supabase.from('pixels').upsert(rows, { onConflict: 'user_id,pixel_id' })
    }

    const { data: pixels } = await supabase
      .from('pixels').select('*').eq('user_id', user.id).order('pixel_name')
    return NextResponse.json({ pixels: pixels || [] })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
