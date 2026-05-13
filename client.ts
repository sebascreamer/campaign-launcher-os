const META_API_VERSION = 'v20.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

export class MetaAPIError extends Error {
  code: number
  type: string
  fbtraceId: string
  constructor(message: string, code: number, type: string, fbtraceId: string) {
    super(message)
    this.name = 'MetaAPIError'
    this.code = code
    this.type = type
    this.fbtraceId = fbtraceId
  }
}

export async function metaGet<T>(path: string, accessToken: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${META_BASE_URL}${path}`)
  url.searchParams.set('access_token', accessToken)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  const data = await res.json()
  if (data.error) throw new MetaAPIError(data.error.message, data.error.code, data.error.type, data.error.fbtrace_id)
  return data as T
}

export async function metaPost<T>(path: string, accessToken: string, body: Record<string, unknown>): Promise<T> {
  const url = `${META_BASE_URL}${path}`
  const formData = new URLSearchParams()
  formData.set('access_token', accessToken)
  Object.entries(body).forEach(([k, v]) => {
    formData.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  })
  const res = await fetch(url, { method: 'POST', body: formData, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  const data = await res.json()
  if (data.error) throw new MetaAPIError(data.error.message, data.error.code, data.error.type, data.error.fbtrace_id)
  return data as T
}
