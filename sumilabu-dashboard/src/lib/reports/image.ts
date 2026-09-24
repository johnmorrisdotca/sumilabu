/**
 * The one screenshot a report may carry, as rules: what it may be, how big,
 * and how much of it one reporter or one project may send in a window.
 * `REPORTS_CONTRACT.md` ("Screenshots") is the document; nothing here touches
 * a database.
 *
 * The type is read from the bytes, never from anything the client says. A
 * site's browser code picks the file and its own server forwards it, so a
 * `Content-Type` or a file name arriving here is a claim two hops removed
 * from the file; the first bytes of the file are not.
 */

export const REPORT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ReportImageType = (typeof REPORT_IMAGE_TYPES)[number];

/**
 * 1 MiB decoded. A phone screenshot re-encoded to WebP or JPEG at a
 * readable width is a few hundred KB; a full-resolution PNG is not, and is
 * not wanted - the images live in the same Neon database as everything else,
 * on a free plan every project shares.
 */
export const REPORT_IMAGE_MAX_BYTES = 1024 * 1024;

/**
 * Bytes of image, on top of the report counts in `REPORT_RATE_LIMITS`. The
 * count alone would let one reporter send 5 MB in ten minutes and a project
 * 200 MB in an hour; these hold it to about three full-size images per
 * reporter and 25 per project.
 */
export const REPORT_IMAGE_BUDGETS = {
  perReporter: { maxBytes: 3 * 1024 * 1024, windowMs: 10 * 60 * 1000 },
  perProject: { maxBytes: 25 * 1024 * 1024, windowMs: 60 * 60 * 1000 },
} as const;

/** Base64 length of `bytes` bytes, padded - the wire size of an image at the cap. */
export function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** The image type these bytes actually are, by their magic number, or null. */
export function sniffImageType(bytes: Uint8Array): ReportImageType | null {
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "image/webp";
  return null;
}

export type DecodedImage = { ok: true; bytes: Buffer; contentType: ReportImageType } | { ok: false; problem: string };

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * The image a create carries, as plain base64 (no `data:` prefix). Node's
 * decoder skips characters it does not know rather than refusing them, so
 * the alphabet is checked first: a body that is not base64 is refused, not
 * quietly decoded into something else.
 */
export function decodeReportImage(base64: string): DecodedImage {
  const text = base64.trim();
  if (text.length === 0 || text.length % 4 !== 0 || !BASE64.test(text)) {
    return { ok: false, problem: "An image must be sent as base64." };
  }
  const bytes = Buffer.from(text, "base64");
  if (bytes.length > REPORT_IMAGE_MAX_BYTES) {
    return { ok: false, problem: `An image is at most ${REPORT_IMAGE_MAX_BYTES.toLocaleString("en-US")} bytes (1 MB).` };
  }
  const contentType = sniffImageType(bytes);
  if (!contentType) return { ok: false, problem: "An image must be a JPEG, PNG or WebP file." };
  return { ok: true, bytes, contentType };
}
