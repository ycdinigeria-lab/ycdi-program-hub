// Photos taken on a phone arrive at three or four thousand pixels wide and
// several megabytes. In this app they are shown at 56 pixels in a circle or
// 86 pixels on a document tile. Sending the original up a Nigerian mobile
// connection is the slowest thing a coordinator does, so it gets shrunk in
// the browser before it ever leaves the device.
//
// BATCH4-MARKER imageCompress

export const MAX_EDGE = 1280;
export const QUALITY = 0.82;

// Work out the drawing size that fits inside a square of maxEdge while
// keeping the shape of the original. Pure maths, kept separate so it can
// be tested without a browser.
export function fitWithin(w, h, maxEdge) {
  if (!w || !h || w < 0 || h < 0) return { w: 0, h: 0, changed: false };
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { w, h, changed: false };
  const scale = maxEdge / longest;
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
    changed: true,
  };
}

// GIFs may be animated and re-encoding would freeze them on frame one.
// SVG is text, already tiny, and would rasterise badly. Anything that
// isn't an image is left completely alone, which matters because the
// documents library uploads PDFs and Word files through the same screen.
export function shouldCompress(file) {
  if (!file || typeof file.type !== "string") return false;
  if (!file.type.startsWith("image/")) return false;
  if (file.type === "image/gif") return false;
  if (file.type === "image/svg+xml") return false;
  return true;
}

export function jpegName(name) {
  const base = String(name || "photo").replace(/\.[^.]+$/, "");
  return (base || "photo") + ".jpg";
}

async function decode(file) {
  // createImageBitmap with from-image applies the EXIF rotation that phones
  // write instead of rotating the pixels. Without it, portrait photos come
  // out on their side.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        /* fall through to the img element */
      }
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
}

// Returns a smaller File, or the original file untouched if anything at all
// goes wrong. An upload never fails because compression failed.
export async function compressImage(file, opts) {
  const maxEdge = (opts && opts.maxEdge) || MAX_EDGE;
  const quality = (opts && opts.quality) || QUALITY;
  if (!shouldCompress(file)) return file;

  let bmp;
  try {
    bmp = await decode(file);
  } catch {
    return file;
  }

  try {
    const { w, h } = fitWithin(bmp.width, bmp.height, maxEdge);
    if (!w || !h) return file;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // JPEG has no transparency. A PNG with a clear background drawn onto a
    // bare canvas and saved as JPEG comes out with black behind it, so the
    // canvas is painted white first.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) return file;

    // Small or already well compressed images can come out bigger. Keep
    // whichever is smaller.
    if (blob.size >= file.size) return file;

    return new File([blob], jpegName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    if (bmp && typeof bmp.close === "function") bmp.close();
  }
}
