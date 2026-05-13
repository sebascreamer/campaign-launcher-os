import { metaPost } from './client'

export interface CreateCampaignParams {
  accountId: string
  accessToken: string
  campaignName: string
  status?: 'PAUSED' | 'ACTIVE'
}

export async function createCampaign(params: CreateCampaignParams) {
  const { accountId, accessToken, campaignName, status = 'PAUSED' } = params
  const result = await metaPost<{ id: string }>(`/act_${accountId}/campaigns`, accessToken, {
    name: campaignName,
    objective: 'OUTCOME_SALES',
    buying_type: 'AUCTION',
    status,
    special_ad_categories: JSON.stringify([]),
  })
  return { id: result.id, name: campaignName, status }
}
