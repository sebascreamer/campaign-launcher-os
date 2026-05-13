import { metaPost, metaGet } from './client'

export async function uploadVideoToMeta(params: {
  accountId: string; accessToken: string; videoBuffer: Buffer; fileName: string; fileSize: number
}): Promise<string> {
  const { accountId, accessToken, videoBuffer, fileName, fileSize } = params
  const initResult = await metaPost<{ video_id: string; upload_url: string }>(`/act_${accountId}/advideos`, accessToken, {
    file_size: fileSize, name: fileName, upload_phase: 'start',
  })
  const { video_id, upload_url } = initResult
  await fetch(upload_url, {
    method: 'POST',
    headers: { Authorization: `OAuth ${accessToken}`, 'file-size': String(fileSize), 'file-offset': '0', 'Content-Type': 'application/octet-stream' },
    body: videoBuffer,
  })
  await metaPost(`/act_${accountId}/advideos`, accessToken, { video_id, upload_phase: 'finish' })
  return await pollVideoStatus(video_id, accessToken)
}

async function pollVideoStatus(videoId: string, accessToken: string): Promise<string> {
  for (let i = 0; i < 36; i++) {
    const result = await metaGet<{ id: string; status: { video_status: string } }>(`/${videoId}`, accessToken, { fields: 'id,status' })
    if (result.status.video_status === 'ready') return videoId
    if (result.status.video_status === 'error') throw new Error(`Video ${videoId} failed to process`)
    await new Promise(r => setTimeout(r, 5000))
  }
  throw new Error(`Video ${videoId} timed out`)
}
