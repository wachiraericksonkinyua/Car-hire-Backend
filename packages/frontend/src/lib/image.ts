export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78))
    if (!compressed || compressed.size >= file.size) return file
    return new File([compressed], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}