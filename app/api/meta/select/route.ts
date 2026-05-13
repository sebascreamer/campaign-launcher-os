// app/api/meta/select/route.ts
// Saves which ad account / pixel / page the user selected as default

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { type, id } = await req.json()

  try {
    if (type === 'ad_account') {
      // Deselect all, then select this one
      await supabase.from('ad_accounts').update({ is_selected: false }).eq('user_id', user.id)
      await supabase.from('ad_accounts').update({ is_selected: true })
        .eq('user_id', user.id).eq('account_id', id)

    } else if (type === 'pixel') {
      await supabase.from('pixels').update({ is_selected: false }).eq('user_id', user.id)
      await supabase.from('pixels').update({ is_selected: true })
        .eq('user_id', user.id).eq('pixel_id', id)

    } else if (type === 'page') {
      await supabase.from('facebook_pages').update({ is_selected: false }).eq('user_id', user.id)
      await supabase.from('facebook_pages').update({ is_selected: true })
        .eq('user_id', user.id).eq('page_id', id)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
