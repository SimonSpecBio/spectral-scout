// Shared by both upload routes (pest-event photos, area background images)
// -- neither validated file type/size before this, just "is it a File
// object," so anything (an oversized file, a non-image with an
// image-sounding name) would get stored and served back with
// access: "public". Low severity (Vercel Blob doesn't execute anything,
// and an <img> tag won't run script even from a crafted SVG), but a real
// gap, not just style.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export function validateImageUpload(file: File): string | null {
  if (!file.type.startsWith("image/")) return "File must be an image";
  if (file.size > MAX_UPLOAD_BYTES) return "File must be under 10MB";
  return null;
}

// Phone photos routinely embed GPS coordinates in EXIF -- for a cannabis/
// crop-cultivation tool specifically, a photo's embedded location is a real
// physical-security concern for a facility's exact address, and every blob
// this app stores is served from a public (if unguessable) URL with no
// app-layer gate on the raw file itself. Re-encoding through sharp with no
// .withMetadata() call strips EXIF (GPS included) and most other metadata
// by default -- .rotate() runs first so the EXIF orientation tag gets
// baked into actual pixel data before it's gone, so a portrait photo
// doesn't end up sideways once that tag is stripped. Both upload routes
// (pest-event photos, area background images) call this before put().
export async function stripImageMetadata(buffer: Buffer, mimeType: string): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const pipeline = sharp(buffer).rotate();
  if (mimeType === "image/png") return pipeline.png().toBuffer();
  if (mimeType === "image/webp") return pipeline.webp().toBuffer();
  if (mimeType === "image/gif") return pipeline.gif().toBuffer();
  return pipeline.jpeg({ quality: 90 }).toBuffer();
}

// Blob keys interpolate the caller's original filename directly -- strips
// it to a safe subset instead of trusting arbitrary client-supplied bytes
// in a storage key.
export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-100);
}
