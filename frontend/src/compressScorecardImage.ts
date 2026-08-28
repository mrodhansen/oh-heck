const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.72;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

/** Resize/compress a scorecard photo so the API payload stays small. */
export async function compressScorecardImage(file: File): Promise<{
  imageBase64: string;
  mimeType: 'image/jpeg';
}> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pick a photo of the scorecard');
  }
  const img = await loadImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 1 || h < 1) {
    throw new Error('Image is empty');
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not process image');
  }
  ctx.drawImage(img, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const prefix = 'data:image/jpeg;base64,';
  if (!dataUrl.startsWith(prefix)) {
    throw new Error('Could not encode image as JPEG');
  }
  return { imageBase64: dataUrl.slice(prefix.length), mimeType: 'image/jpeg' };
}
