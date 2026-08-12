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

// Blob keys interpolate the caller's original filename directly -- strips
// it to a safe subset instead of trusting arbitrary client-supplied bytes
// in a storage key.
export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-100);
}
