// lib/utm.ts

export function appendUTMs(baseUrl: string, campaignName: string, adName: string): string {
  try {
    const url = new URL(baseUrl)
    url.searchParams.set('utm_source', 'meta')
    url.searchParams.set('utm_medium', 'paid')
    url.searchParams.set('utm_campaign', campaignName.toLowerCase())
    if (adName) url.searchParams.set('utm_content', adName.toLowerCase())
    return url.toString()
  } catch {
    return baseUrl
  }
}
