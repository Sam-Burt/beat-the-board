"use client";

// Phone camera photos routinely land well past Vercel's ~4.5MB request-body
// cap for serverless functions — a platform limit, not something raisable
// via Next.js config. A request over that limit gets rejected before the
// function is ever invoked, so the server-side route never even sees it or
// gets a chance to return a real error — the client just gets a bare failed
// response with no JSON body, which is what surfaced as the generic "That
// didn't work." This downscales and re-encodes as JPEG client-side, before
// the file ever leaves the device, so uploads land comfortably under that
// limit regardless of how big the original shot was.
//
// 2400px/0.85 keeps these good enough to print (roughly an 8x10 at print
// quality) — a worst-case incompressible test photo still only landed
// around 2-2.5MB at those settings, well clear of the cap. The second,
// smaller/lower-quality attempt only exists as a safety net for the rare
// pathological photo (dense noise, heavy text) that doesn't compress as
// well as normal photos do — never seen it trigger in testing, but the
// alternative is silently re-introducing the exact bug this exists to fix.
const SAFE_MAX_BYTES = 4 * 1024 * 1024; // stay clear of Vercel's ~4.5MB cap
const SKIP_BELOW_BYTES = 1.5 * 1024 * 1024; // already small enough — don't bother
const ATTEMPTS = [
  { maxDimension: 2400, quality: 0.85 },
  { maxDimension: 1600, quality: 0.75 },
];

function encode(bitmap, maxDimension, quality) {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function compressImageFile(file) {
  if (!file?.type?.startsWith("image/") || file.size <= SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    let blob = null;
    for (const { maxDimension, quality } of ATTEMPTS) {
      blob = await encode(bitmap, maxDimension, quality);
      if (blob && blob.size <= SAFE_MAX_BYTES) break;
    }
    bitmap.close?.();

    // Compression didn't actually help (rare, e.g. a tiny high-detail PNG) —
    // keep the original rather than upload something bigger than we started with.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // Decoding failed (an exotic format the browser can't handle, etc.) —
    // fall back to the original file rather than blocking the upload here.
    return file;
  }
}
