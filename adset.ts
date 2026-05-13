import { metaPost } from './client'

export async function createAdSet(params: {
  accountId: string; accessToken: string; campaignId: string; adSetName: string
  dailyBudgetCents: number; pixelId: string; conversionEvent: string; country: string
  ageMin: number; ageMax: number; genders: number[]; status?: 'PAUSED' | 'ACTIVE'
}) {
  const { accountId, accessToken, campaignId, adSetName, dailyBudgetCents, pixelId, conversionEvent, country, ageMin, ageMax, genders, status = 'PAUSED' } = params
  const targeting = {
    geo_locations: { countries: [country] }, age_min: ageMin, age_max: ageMax,
    ...(genders.length < 2 ? { genders } : {}),
    publisher_platforms: ['facebook', 'instagram', 'audience_network'],
    facebook_positions: ['feed', 'story', 'reels'], instagram_positions: ['stream', 'story', 'reels'],
    device_platforms: ['mobile', 'desktop'],
  }
  const result = await metaPost<{ id: string }>(`/act_${accountId}/adsets`, accessToken, {
    name: adSetName, campaign_id: campaignId, daily_budget: dailyBudgetCents,
    billing_event: 'IMPRESSIONS', optimization_goal: 'OFFSITE_CONVERSIONS',
    promoted_object: JSON.stringify({ pixel_id: pixelId, custom_event_type: conversionEvent }),
    targeting: JSON.stringify(targeting),
    attribution_spec: JSON.stringify([{ event_type: 'CLICK_THROUGH', window_days: 7 }]),
    status,
  })
  return { id: result.id, name: adSetName }
}
