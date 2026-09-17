/**
 * Zdjęcie z telefonu potrafi ważyć 5–10 MB. Zmniejszamy je w przeglądarce do najwyżej
 * `max` px na dłuższym boku i zapisujemy jako JPEG — wysyłka jest szybka, a serwer dostaje ~200–400 KB.
 */
export async function shrinkPhoto(file: File, max = 1600): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.84));
  } catch {
    return file.size <= 3 * 1024 * 1024 ? file : null;
  }
}
