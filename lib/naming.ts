// lib/naming.ts

function sanitizeName(str: string): string {
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40)
}

export function generateCampaignName(producto: string, pais: string, fecha: Date): string {
  const day = String(fecha.getDate()).padStart(2, '0')
  const month = String(fecha.getMonth() + 1).padStart(2, '0')
  const year = String(fecha.getFullYear()).slice(2)
  const dateStr = `${day}${month}${year}`
  const prod = sanitizeName(producto)
  const country = pais.toUpperCase().slice(0, 3)
  return `ABO_TEST_${prod}_${country}_${dateStr}`
}

export function generateAdSetName(index: number, videoName: string): string {
  const num = String(index + 1).padStart(2, '0')
  const name = sanitizeName(videoName.replace(/\.[^.]+$/, ''))
  return `ADSET_${num}_${name}`
}

export function generateAdName(index: number, videoName: string): string {
  const num = String(index + 1).padStart(2, '0')
  const name = sanitizeName(videoName.replace(/\.[^.]+$/, ''))
  return `AD_${num}_${name}`
}
