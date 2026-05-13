// lib/validators.ts

export function validateABOForm(fields: Record<string, unknown>, videos: File[]) {
  const errors: string[] = []

  if (!fields.productName) errors.push('El nombre del producto es requerido.')
  if (!fields.country) errors.push('El país es requerido.')

  try {
    new URL(fields.destinationUrl as string)
  } catch {
    errors.push('La URL de destino no es válida. Debe incluir https://')
  }

  const budget = Number(fields.dailyBudget)
  if (!budget || budget < 1) errors.push('El presupuesto diario mínimo es $1 USD por ad set.')
  if (budget > 50000) errors.push('El presupuesto máximo por ad set es $50,000 USD.')

  if (!fields.pixelId) errors.push('Debes seleccionar un Pixel.')
  if (!fields.pageId) errors.push('Debes seleccionar una Facebook Page.')
  if (!fields.primaryText) errors.push('El texto principal es requerido.')
  if (!fields.headline) errors.push('El titular es requerido.')

  if (videos.length === 0) errors.push('Debes subir al menos 1 video.')
  if (videos.length > 10) errors.push('Máximo 10 videos por lanzamiento.')

  const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/avi', 'video/x-m4v']
  const MAX_SIZE = 4 * 1024 * 1024 * 1024

  videos.forEach((v, i) => {
    if (!ALLOWED_TYPES.includes(v.type)) {
      errors.push(`Video ${i + 1} (${v.name}): usa MP4, MOV o AVI.`)
    }
    if (v.size > MAX_SIZE) {
      errors.push(`Video ${i + 1} (${v.name}): supera el límite de 4GB.`)
    }
  })

  return { valid: errors.length === 0, errors }
}
