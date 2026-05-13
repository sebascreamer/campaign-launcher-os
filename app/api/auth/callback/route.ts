// app/api/auth/callback/route.ts
// Meta redirige aquí con el code — lo intercambiamos por un token long-lived

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/crypto'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

  // User cancelled
  if (error) {
    return NextResponse.redirect(`${APP_URL}/connect?error=cancelled`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${APP_URL}/connect?error=missing_params`)
  }

  // Decode user ID from state
  let userId: string
  try {
    userId = Buffer.from(state, 'base64').toString('utf8')
  } catch {
    return NextResponse.redirect(`${APP_URL}/connect?error=invalid_state`)
  }

  const APP_ID = process.env.META_APP_ID!
  const APP_SECRET = process.env.META_APP_SECRET!
  const REDIRECT_URI = `${APP_URL}/api/auth/callback`

  try {
    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?` +
      `client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`
    )
    const tokenData = await tokenRes.json()

    if (tokenData.error) {
      console.error('Meta token exchange error:', tokenData.error)
      return NextResponse.redirect(`${APP_URL}/connect?error=token_exchange`)
    }

    const shortLivedToken = tokenData.access_token

    // Step 2: Exchange for long-lived token (~60 days)
    const longTokenRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?` +
      `grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortLivedToken}`
    )
    const longTokenData = await longTokenRes.json()

    if (longTokenData.error) {
      console.error('Meta long-lived token error:', longTokenData.error)
      return NextResponse.redirect(`${APP_URL}/connect?error=long_token`)
    }

    const longLivedToken = longTokenData.access_token
    const expiresIn = longTokenData.expires_in || 5184000 // default 60 days
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Step 3: Get Meta user info
    const userRes = await fetch(
      `https://graph.facebook.com/v20.0/me?fields=id,name&access_token=${longLivedToken}`
    )
    const metaUser = await userRes.json()

    // Step 4: Get granted scopes
    const scopesRes = await fetch(
      `https://graph.facebook.com/v20.0/me/permissions?access_token=${longLivedToken}`
    )
    const scopesData = await scopesRes.json()
    const grantedScopes = scopesData.data
      ?.filter((s: { permission: string; status: string }) => s.status === 'granted')
      .map((s: { permission: string }) => s.permission) || []

    // Step 5: Encrypt and save token
    const encryptedToken = encryptToken(longLivedToken)

    // Use service client to bypass RLS (we're writing for the user from server)
    const { createClient: createSupabaseAdmin } = await import('@supabase/supabase-js')
    const admin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Upsert connection (update if exists, insert if not)
    const { error: upsertError } = await admin
      .from('meta_connections')
      .upsert({
        user_id: userId,
        meta_user_id: metaUser.id,
        meta_user_name: metaUser.name,
        encrypted_token: encryptedToken,
        token_expires_at: expiresAt,
        scopes: grantedScopes,
        is_active: true,
        connected_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      }, { onConflict: 'user_id,meta_user_id' })

    if (upsertError) {
      console.error('Supabase upsert error:', upsertError)
      return NextResponse.redirect(`${APP_URL}/connect?error=db_save`)
    }

    // Step 6: Pre-load Ad Accounts automatically
    try {
      const accountsRes = await fetch(
        `https://graph.facebook.com/v20.0/me/adaccounts?fields=id,name,currency,account_status,account_id&limit=50&access_token=${longLivedToken}`
      )
      const accountsData = await accountsRes.json()

      if (accountsData.data?.length > 0) {
        const accountRows = accountsData.data.map((acc: {
          account_id: string; name: string; currency: string; account_status: number
        }) => ({
          user_id: userId,
          account_id: acc.account_id,
          account_name: acc.name,
          currency: acc.currency,
          account_status: acc.account_status,
          last_synced_at: new Date().toISOString(),
        }))

        await admin.from('ad_accounts')
          .upsert(accountRows, { onConflict: 'user_id,account_id' })
      }
    } catch (e) {
      console.error('Pre-load accounts error (non-fatal):', e)
    }

    // Redirect to connect page with success
    return NextResponse.redirect(`${APP_URL}/connect?success=1`)

  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(`${APP_URL}/connect?error=unknown`)
  }
}
