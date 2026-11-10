"use client";

/**
 * Shrink a camera photo on the phone *before* it is queued for upload.
 *
 * Mid-range Android cameras produce 3–8 MB JPEGs. On a patchy West Coast
 * connection, uploading those over cellular is slow and burns the tech's data.
 * We decode the image, scale the longest side down to 1600px, and re-encode as
 * JPEG q0.72 — typically ~300–500KB — which is plenty for job evidence.
 *
 * EXIF orientation is honoured via createImageBitmap({ imageOrientation:
 * "from-image" }) so portrait phone photos don't come out sideways; the
 * re-encoded JPEG is upright with no orientation tag. The <img> fallback can't
 * read EXIF, so it is a best-effort last resort for browsers without
 * createImageBitmap.
 *
 * Anything already small (< ~500KB) or not an image is returned untouched —
 * re-encoding a small file only degrades it.
 */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.72;
const SKIP_BELOW_BYTES = 500 * 1024; // ~500KB

function targetSize(width: number, height: number): { width: number; height: number } {
    const longest = Math.max(width, height);
    if (longest <= MAX_EDGE) return { width, height };
    const scale = MAX_EDGE / longest;
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Decode via createImageBitmap honouring EXIF orientation; null if unsupported. */
async function decodeBitmap(file: Blob): Promise<ImageBitmap | null> {
    if (typeof createImageBitmap !== "function") return null;
    try {
        // `imageOrientation: "from-image"` bakes EXIF rotation into the pixels.
        return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
        try {
            // Some engines reject the options arg — retry without it.
            return await createImageBitmap(file);
        } catch {
            return null;
        }
    }
}

/** Last-resort decode through an <img> element (no EXIF handling). */
function decodeImageElement(file: Blob): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        if (typeof document === "undefined" || typeof URL === "undefined") {
            resolve(null);
            return;
        }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        img.src = url;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => {
        if (typeof canvas.toBlob === "function") {
            canvas.toBlob((blob) => resolve(blob), "image/jpeg", JPEG_QUALITY);
        } else {
            resolve(null);
        }
    });
}

/**
 * Resize/re-encode a picked image for upload. Always resolves to a File —
 * returns the original untouched if it is already small, not an image, or if
 * decoding/encoding isn't available in this browser (never throws, so the
 * capture flow can't be blocked by a resize failure).
 */
export async function resizeImageForUpload(file: File): Promise<File> {
    if (typeof window === "undefined") return file;
    if (!file.type.startsWith("image/")) return file;
    // GIF/SVG etc. re-encoded to JPEG would lose animation/quality for no gain.
    if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
    if (file.size <= SKIP_BELOW_BYTES) return file;

    let width = 0;
    let height = 0;
    let source: CanvasImageSource | null = null;
    let bitmap: ImageBitmap | null = null;

    try {
        bitmap = await decodeBitmap(file);
        if (bitmap) {
            width = bitmap.width;
            height = bitmap.height;
            source = bitmap;
        } else {
            const img = await decodeImageElement(file);
            if (!img) return file;
            width = img.naturalWidth;
            height = img.naturalHeight;
            source = img;
        }

        if (!width || !height) return file;

        const target = targetSize(width, height);
        const canvas = document.createElement("canvas");
        canvas.width = target.width;
        canvas.height = target.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return file;
        ctx.drawImage(source, 0, 0, target.width, target.height);

        const blob = await canvasToBlob(canvas);
        if (!blob) return file;
        // A larger result means the original was already well-compressed — keep it.
        if (blob.size >= file.size) return file;

        const baseName = (file.name || "photo").replace(/\.[^.]+$/, "");
        return new File([blob], `${baseName}.jpg`, {
            type: "image/jpeg",
            lastModified: Date.now(),
        });
    } catch {
        return file;
    } finally {
        bitmap?.close?.();
    }
}
