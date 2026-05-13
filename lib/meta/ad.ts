import { metaPost } from './client'

export async function createAd(params: {
  accountId: string; accessToken: string; adName: string; adSetId: string
  creativeId: string; pixelId: string; status?: 'PAUSED' | 'ACTIVE'
}) {
  const { accountId, accessToken, adName, adSetId, creativeId, pixelId, status = 'PAUSED' } = params
  const result = await metaPost<{ id: string }>(`/act_${accountId}/ads`, accessToken, {
    name: adName, adset_id: adSetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status,
    tracking_specs: JSON.stringify([{ 'action.type': ['offsite_conversion'], 'fb.pixel': [pixelId] }]),
  })
  return { id: result.id, name: adName }
}
