// app/api/auth/meta/route.ts
// Inicia el flujo OAuth con Meta — redirige al usuario a Meta

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const APP_ID = process.env.META_APP_ID!
  const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`

  // State contains user ID encrypted as base64 to verify on callback
  const state = Buffer.from(user.id).toString('base64')

  const scopes = [
    'ads_management',
    'ads_read',
    'pages_read_engagement',
    'pages_manage_ads',
    'business_management',
    'instagram_basic',
  ].join(',')

  const metaAuthUrl = new URL('https://www.facebook.com/v20.0/dialog/oauth')
  metaAuthUrl.searchParams.set('client_id', APP_ID)
  metaAuthUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  metaAuthUrl.searchParams.set('scope', scopes)
  metaAuthUrl.searchParams.set('state', state)
  metaAuthUrl.searchParams.set('response_type', 'code')

  return NextResponse.redirect(metaAuthUrl.toString())
}
