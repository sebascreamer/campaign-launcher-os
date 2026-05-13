// app/api/meta/pages/route.ts
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
      `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,category&limit=50&access_token=${token}`
    )
    const data = await res.json()
    if (data.error) {
      return NextResponse.json({ error: `Error Meta: ${data.error.message}` }, { status: 422 })
    }

    if (data.data?.length) {
      const rows = data.data.map((pg: { id: string; name: string; category?: string }) => ({
        user_id: user.id,
        page_id: pg.id,
        page_name: pg.name,
        page_category: pg.category || null,
        last_synced_at: new Date().toISOString(),
      }))
      await supabase.from('facebook_pages').upsert(rows, { onConflict: 'user_id,page_id' })
    }

    const { data: pages } = await supabase
      .from('facebook_pages').select('*').eq('user_id', user.id).order('page_name')
    return NextResponse.json({ pages: pages || [] })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
