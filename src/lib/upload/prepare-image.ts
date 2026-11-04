export const MAX_UPLOAD_EDGE = 1200;
export const JPEG_QUALITY = 0.75;

export function scaledDimensions(width: number, height: number, maxEdge = MAX_UPLOAD_EDGE) {
  if (width <= 0 || height <= 0) throw new Error("Image dimensions must be positive.");
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Prepare a bounded JPEG derivative before network transport. */
export async function prepareUploadImage(file: File): Promise<File> {
  if (typeof window === "undefined" || typeof document === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return file;
  // Browsers expose canvas.toBlob; DOM test environments often do not.
  // Return the original file there instead of waiting on an image decoder
  // that cannot ever resolve.
  if (typeof HTMLCanvasElement === "undefined" || typeof HTMLCanvasElement.prototype.toBlob !== "function") return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const dimensions = scaledDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return file;
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to decode image."));
    image.src = source;
  });
}
