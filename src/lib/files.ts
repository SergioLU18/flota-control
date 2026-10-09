// Utilidades de archivos del lado del navegador.

/**
 * Redimensiona y comprime una foto antes de "subirla" (máx. 1280 px, JPEG 75 %).
 * En producción el resultado se enviaría a almacenamiento tipo S3 con una URL firmada.
 */
export async function compressImage(file: File, maxSide = 1280, quality = 0.75): Promise<{ url: string; kb: number; originalKb: number }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const url = canvas.toDataURL('image/jpeg', quality)
  return { url, kb: Math.round((url.length * 3) / 4 / 1024), originalKb: Math.round(file.size / 1024) }
}

/** Descarga un CSV con BOM para que Excel respete acentos. */
export function downloadCsv(filename: string, rows: (string | number | undefined)[][]) {
  const esc = (v: string | number | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
