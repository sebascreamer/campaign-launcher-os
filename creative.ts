import { metaPost } from './client'

export async function createAdCreative(params: {
  accountId: string; accessToken: string; creativeName: string; pageId: string
  videoId: string; primaryText: string; headline: string; description?: string
  ctaType: string; destinationUrl: string; igAccountId?: string
}) {
  const { accountId, accessToken, creativeName, pageId, videoId, primaryText, headline, description, ctaType, destinationUrl, igAccountId } = params
  const videoData: Record<string, unknown> = {
    video_id: videoId, message: primaryText, title: headline,
    call_to_action: { type: ctaType, value: { link: destinationUrl } },
  }
  if (description) videoData.description = description
  const objectStorySpec: Record<string, unknown> = { page_id: pageId, video_data: videoData }
  const body: Record<string, unknown> = { name: creativeName, object_story_spec: JSON.stringify(objectStorySpec) }
  if (igAccountId) body.instagram_actor_id = igAccountId
  const result = await metaPost<{ id: string }>(`/act_${accountId}/adcreatives`, accessToken, body)
  return { id: result.id, name: creativeName }
}
