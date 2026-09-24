import { describe, expect, it } from "vitest";

import { REPORT_IMAGE_BUDGETS, REPORT_IMAGE_MAX_BYTES, base64Length, decodeReportImage, sniffImageType } from "./image";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

function bytes(signature: number[], size = 64): Buffer {
  const out = Buffer.alloc(Math.max(size, signature.length));
  Buffer.from(signature).copy(out);
  return out;
}

describe("sniffImageType", () => {
  it("reads JPEG, PNG and WebP from their first bytes", () => {
    expect(sniffImageType(bytes(JPEG))).toBe("image/jpeg");
    expect(sniffImageType(bytes(PNG))).toBe("image/png");
    expect(sniffImageType(bytes(WEBP))).toBe("image/webp");
  });

  it("refuses anything else, however it is named", () => {
    expect(sniffImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImageType(Buffer.from("GIF89a..."))).toBeNull();
    expect(sniffImageType(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull(); // RIFF WAVE
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("decodeReportImage", () => {
  it("accepts a PNG up to the cap exactly", () => {
    const decoded = decodeReportImage(bytes(PNG, REPORT_IMAGE_MAX_BYTES).toString("base64"));
    expect(decoded).toMatchObject({ ok: true, contentType: "image/png" });
    expect(decoded.ok && decoded.bytes.length).toBe(REPORT_IMAGE_MAX_BYTES);
  });

  it("refuses one byte over the cap", () => {
    expect(decodeReportImage(bytes(PNG, REPORT_IMAGE_MAX_BYTES + 1).toString("base64"))).toMatchObject({ ok: false });
  });

  it("refuses text that is not base64 rather than decoding what it can", () => {
    expect(decodeReportImage("not base64 at all!")).toEqual({ ok: false, problem: "An image must be sent as base64." });
    expect(decodeReportImage(`data:image/png;base64,${bytes(PNG).toString("base64")}`)).toMatchObject({ ok: false });
    expect(decodeReportImage("")).toMatchObject({ ok: false });
  });

  it("refuses a file that is not one of the three types", () => {
    expect(decodeReportImage(Buffer.from("plain text, called screenshot.png").toString("base64"))).toEqual({
      ok: false,
      problem: "An image must be a JPEG, PNG or WebP file.",
    });
  });
});

describe("the image limits the contract names", () => {
  it("caps one image at 1 MiB", () => {
    expect(REPORT_IMAGE_MAX_BYTES).toBe(1024 * 1024);
    expect(base64Length(3)).toBe(4);
    expect(base64Length(4)).toBe(8);
  });

  it("holds a reporter to 3 MiB in 10 minutes and a project to 25 MiB an hour", () => {
    expect(REPORT_IMAGE_BUDGETS.perReporter).toEqual({ maxBytes: 3 * 1024 * 1024, windowMs: 10 * 60 * 1000 });
    expect(REPORT_IMAGE_BUDGETS.perProject).toEqual({ maxBytes: 25 * 1024 * 1024, windowMs: 60 * 60 * 1000 });
  });
});
