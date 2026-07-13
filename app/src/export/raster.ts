// Print labs take TIFF and JPEG, not PNG — WhiteWall's wall-art upload rejects PNG
// outright. A canvas can only encode PNG and JPEG, and its JPEG carries neither the
// print resolution nor a colour profile, so both are assembled here: a Deflate
// TIFF, and a JPEG with the DPI and an sRGB profile written into its headers.

/**
 * Deflate, TIFF compression tag 8 — a zlib stream, which is exactly what
 * CompressionStream('deflate') emits. Hand-rolling LZW here is a trap: TIFF's variant
 * grows its code width one code earlier than GIF's, and a single-code desync yields a
 * file that opens, reports the right size, and then fails to decode at the lab.
 */
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Baseline RGB TIFF, Deflate, with resolution and an embedded ICC profile. */
export async function encodeTiff(rgba: Uint8ClampedArray, w: number, h: number, dpi: number, icc: Uint8Array): Promise<Blob> {
  // strip the alpha: labs composite it inconsistently, and the sheet is opaque anyway
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  const pixels = await deflate(rgb);

  const ENTRIES = 13; // 12 baseline tags + the ICC profile
  const IFD_OFFSET = 8;
  const ifdSize = 2 + ENTRIES * 12 + 4;
  // values too big for the 4-byte inline slot live after the IFD
  const resOffset = IFD_OFFSET + ifdSize;
  const bitsOffset = resOffset + 16; // two RATIONALs
  const iccOffset = bitsOffset + 6; // three SHORTs
  const dataOffset = iccOffset + icc.length;

  const buf = new ArrayBuffer(dataOffset + pixels.length);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const LE = true;

  dv.setUint16(0, 0x4949, LE); // little-endian
  dv.setUint16(2, 42, LE);
  dv.setUint32(4, IFD_OFFSET, LE);
  dv.setUint16(IFD_OFFSET, ENTRIES, LE);

  let p = IFD_OFFSET + 2;
  const entry = (tag: number, type: number, count: number, value: number) => {
    dv.setUint16(p, tag, LE);
    dv.setUint16(p + 2, type, LE);
    dv.setUint32(p + 4, count, LE);
    // SHORT values sit in the high half of the slot when they fit inline
    if (type === 3 && count === 1) dv.setUint16(p + 8, value, LE);
    else dv.setUint32(p + 8, value, LE);
    p += 12;
  };

  // TIFF requires the IFD entries in ascending tag order — 34675 (ICC) therefore last
  entry(256, 3, 1, w); // ImageWidth
  entry(257, 3, 1, h); // ImageLength
  entry(258, 3, 3, bitsOffset); // BitsPerSample 8,8,8
  entry(259, 3, 1, 8); // Compression = Deflate (zlib)
  entry(262, 3, 1, 2); // PhotometricInterpretation = RGB
  entry(273, 4, 1, dataOffset); // StripOffsets
  entry(277, 3, 1, 3); // SamplesPerPixel
  entry(278, 4, 1, h); // RowsPerStrip — one strip
  entry(279, 4, 1, pixels.length); // StripByteCounts
  entry(282, 5, 1, resOffset); // XResolution
  entry(283, 5, 1, resOffset + 8); // YResolution
  entry(296, 3, 1, 2); // ResolutionUnit = inch
  entry(34675, 7, icc.length, iccOffset); // ICC profile
  dv.setUint32(p, 0, LE); // no next IFD

  dv.setUint32(resOffset, dpi, LE);
  dv.setUint32(resOffset + 4, 1, LE);
  dv.setUint32(resOffset + 8, dpi, LE);
  dv.setUint32(resOffset + 12, 1, LE);
  dv.setUint16(bitsOffset, 8, LE);
  dv.setUint16(bitsOffset + 2, 8, LE);
  dv.setUint16(bitsOffset + 4, 8, LE);
  u8.set(icc, iccOffset);
  u8.set(pixels, dataOffset);

  return new Blob([buf], { type: 'image/tiff' });
}

/**
 * Rewrite a canvas JPEG so it declares its print resolution and carries the sRGB profile.
 * Two things to get right, both learned the hard way: Chrome already writes an ICC APP2
 * of its own, so ours has to replace it rather than join it — two profiles and a reader
 * trusts neither. And the JFIF APP0 must stay the first segment after SOI, so the ICC
 * goes after it, not before.
 */
export async function tagJpeg(blob: Blob, dpi: number, icc: Uint8Array): Promise<Blob> {
  const src = new Uint8Array(await blob.arrayBuffer());
  const ICC_TAG = 'ICC_PROFILE\0';
  const tag = new TextEncoder().encode(ICC_TAG);

  const app2 = new Uint8Array(4 + tag.length + 2 + icc.length);
  const dv2 = new DataView(app2.buffer);
  dv2.setUint16(0, 0xffe2);
  dv2.setUint16(2, app2.length - 2);
  app2.set(tag, 4);
  app2[4 + tag.length] = 1; // chunk 1
  app2[5 + tag.length] = 1; // of 1
  app2.set(icc, 6 + tag.length);

  const isIccApp2 = (seg: Uint8Array) =>
    seg[1] === 0xe2 && new TextDecoder('latin1').decode(seg.subarray(4, 4 + tag.length)) === ICC_TAG;

  const out: Uint8Array[] = [src.subarray(0, 2)]; // SOI
  let placed = false;
  let i = 2;
  while (i < src.length - 1) {
    if (src[i] !== 0xff) break;
    const marker = src[i + 1];
    if (marker === 0xda) {
      if (!placed) out.push(app2); // no APP0 at all — land it before the scan
      out.push(src.subarray(i)); // start of scan: the rest is entropy-coded
      break;
    }
    const len = (src[i + 2] << 8) | src[i + 3];
    const seg = src.subarray(i, i + 2 + len);
    i += 2 + len;

    if (isIccApp2(seg)) continue; // drop the browser's profile; ours replaces it

    if (marker === 0xe0 && len >= 16) {
      // JFIF APP0: FFE0 | len | "JFIF\0" | ver(2) | units | Xdensity(2) | Ydensity(2)
      //            0 1    2 3    4..8      9 10     11      12 13          14 15
      const fixed = new Uint8Array(seg);
      const dvf = new DataView(fixed.buffer);
      dvf.setUint8(11, 1); // units = dots per inch
      dvf.setUint16(12, dpi);
      dvf.setUint16(14, dpi);
      out.push(fixed);
      out.push(app2); // ICC directly after JFIF
      placed = true;
      continue;
    }
    out.push(seg);
  }
  return new Blob(out as BlobPart[], { type: 'image/jpeg' });
}
