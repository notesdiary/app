#!/usr/bin/env node
/**
 * PNG icon generator for Notes Diary PWA
 * Renders the real app icon: navy rounded-square background with cyan/navy glyph
 * Uses pure per-pixel math with Node's built-in zlib (no external image library)
 */

import fs from 'fs';
import zlib from 'zlib';

const ICON_DIR = './public/icons';
const NAVY = [8, 26, 89];      // #081A59
const CYAN = [217, 250, 255];  // #D9FAFF

// Source proportions (30x30 outer square, 20x20 inner glyph viewBox)
const SOURCE_SIZE = 30;
const SOURCE_CORNER_RADIUS = 8;
const GLYPH_VIEWBOX_SIZE = 20;
const GLYPH_OFFSET = (SOURCE_SIZE - GLYPH_VIEWBOX_SIZE) / 2; // 5

// Notebook page outline (rounded rect stroke) in glyph viewBox coordinates
const PAGE = { x: 3, y: 1.5, width: 14, height: 17, r: 2 };
const PAGE_STROKE_WIDTH = 1.2;

// Ring specs (5 cyan-stroked circles, spiral binding) in glyph viewBox coordinates
const RINGS = [
  { cx: 3, cy: 3.5, r: 1.3 },
  { cx: 3, cy: 6.5, r: 1.3 },
  { cx: 3, cy: 9.5, r: 1.3 },
  { cx: 3, cy: 12.5, r: 1.3 },
  { cx: 3, cy: 15.5, r: 1.3 },
];
const RING_STROKE_WIDTH = 1.1;

// Bar specs (3 cyan ruled-line segments) in glyph viewBox coordinates
const BARS = [
  { x1: 7, y1: 6.5, x2: 14, y2: 6.5 },
  { x1: 7, y1: 9.5, x2: 14, y2: 9.5 },
  { x1: 7, y1: 12.5, x2: 12, y2: 12.5 },
];

const STROKE_WIDTH = 1.2; // In source viewBox coordinates

function createPNG(width, height, maskable = false) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // CRC32 lookup table
  const CRC32_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    CRC32_TABLE[n] = c;
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // Helper: check if point is inside rounded rectangle
  function pointInRoundedRect(px, py, rectW, rectH, cornerRadius) {
    // Main body areas (away from corners)
    if (px >= cornerRadius && px <= rectW - cornerRadius && py >= 0 && py <= rectH) return true;
    if (py >= cornerRadius && py <= rectH - cornerRadius && px >= 0 && px <= rectW) return true;

    // Corner circles
    const corners = [
      { cx: cornerRadius, cy: cornerRadius },                     // top-left
      { cx: rectW - cornerRadius, cy: cornerRadius },             // top-right
      { cx: cornerRadius, cy: rectH - cornerRadius },             // bottom-left
      { cx: rectW - cornerRadius, cy: rectH - cornerRadius },     // bottom-right
    ];

    for (const corner of corners) {
      const dx = px - corner.cx;
      const dy = py - corner.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= cornerRadius) return true;
    }

    return false;
  }

  // Helper: compute distance from point to line segment
  function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      // Degenerate segment (single point)
      return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
    }

    // Project point onto segment line, clamped to segment bounds
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;

    return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
  }

  // Helper: distance from point to circle center
  function distanceFromCenter(px, py, cx, cy) {
    const dx = px - cx;
    const dy = py - cy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Helper: signed distance from point to a rounded rectangle's edge (negative = inside)
  function roundedRectSDF(px, py, rectX, rectY, rectW, rectH, cornerRadius) {
    const cx = rectX + rectW / 2;
    const cy = rectY + rectH / 2;
    const halfW = rectW / 2 - cornerRadius;
    const halfH = rectH / 2 - cornerRadius;
    const qx = Math.abs(px - cx) - halfW;
    const qy = Math.abs(py - cy) - halfH;
    const outsideX = Math.max(qx, 0);
    const outsideY = Math.max(qy, 0);
    return Math.sqrt(outsideX * outsideX + outsideY * outsideY) + Math.min(Math.max(qx, qy), 0) - cornerRadius;
  }

  // Scaling factor
  const scale = width / SOURCE_SIZE;
  const scaledCornerRadius = SOURCE_CORNER_RADIUS * scale;
  const scaledGlyphOffset = GLYPH_OFFSET * scale;
  const scaledGlyphSize = GLYPH_VIEWBOX_SIZE * scale;
  const scaledStrokeWidth = STROKE_WIDTH * scale;

  // Create image data (RGB, 3 bytes per pixel)
  const imageData = [];
  for (let y = 0; y < height; y++) {
    imageData.push(0); // filter type for this scanline

    for (let x = 0; x < width; x++) {
      // Default: navy background
      let r = NAVY[0], g = NAVY[1], b = NAVY[2];

      if (maskable) {
        // Maskable variant: full-bleed navy square, glyph scaled to ~80% safe zone
        const glyphCenterX = width / 2;
        const glyphCenterY = height / 2;
        const safeZoneScale = 0.8;
        const safedGlyphSize = scaledGlyphSize * safeZoneScale;

        const glyphMinX = glyphCenterX - safedGlyphSize / 2;
        const glyphMaxX = glyphCenterX + safedGlyphSize / 2;
        const glyphMinY = glyphCenterY - safedGlyphSize / 2;
        const glyphMaxY = glyphCenterY + safedGlyphSize / 2;

        if (x >= glyphMinX && x <= glyphMaxX && y >= glyphMinY && y <= glyphMaxY) {
          // Map pixel back to glyph viewBox coordinates
          const glyphLocalX = (x - glyphMinX) / safedGlyphSize;
          const glyphLocalY = (y - glyphMinY) / safedGlyphSize;
          const glyphX = glyphLocalX * GLYPH_VIEWBOX_SIZE;
          const glyphY = glyphLocalY * GLYPH_VIEWBOX_SIZE;

          // Check page outline (cyan stroked rounded rect)
          const pageSDF = roundedRectSDF(
            glyphX, glyphY,
            PAGE.x, PAGE.y, PAGE.width, PAGE.height, PAGE.r
          );
          let onCyan = Math.abs(pageSDF) <= (PAGE_STROKE_WIDTH / 2) * safeZoneScale;

          // Check rings (cyan stroked circles, punched through with navy fill)
          let inRing = false;
          for (const ring of RINGS) {
            const dist = distanceFromCenter(glyphX, glyphY, ring.cx, ring.cy);
            const scaledRingR = ring.r * safeZoneScale;
            const scaledRingStroke = (RING_STROKE_WIDTH / 2) * safeZoneScale;
            if (dist <= scaledRingR + scaledRingStroke) {
              inRing = true;
              onCyan = dist >= scaledRingR - scaledRingStroke;
              break;
            }
          }

          // Check bars (cyan ruled lines), drawn on top of everything else
          let onBar = false;
          for (const bar of BARS) {
            const dist = distanceToSegment(glyphX, glyphY, bar.x1, bar.y1, bar.x2, bar.y2);
            const scaledBarStroke = (STROKE_WIDTH / 2) * safeZoneScale;
            if (dist <= scaledBarStroke) {
              onBar = true;
              break;
            }
          }

          if (onBar || onCyan) {
            r = CYAN[0];
            g = CYAN[1];
            b = CYAN[2];
          } else if (inRing) {
            r = NAVY[0];
            g = NAVY[1];
            b = NAVY[2];
          }
        }
      } else {
        // Regular variant: rounded-square background, glyph at full proportions
        // Check if point is inside the rounded rectangle background
        if (pointInRoundedRect(x, y, width, height, scaledCornerRadius)) {
          // Inside rounded rect - check for glyph
          const glyphMinX = scaledGlyphOffset;
          const glyphMaxX = scaledGlyphOffset + scaledGlyphSize;
          const glyphMinY = scaledGlyphOffset;
          const glyphMaxY = scaledGlyphOffset + scaledGlyphSize;

          if (x >= glyphMinX && x <= glyphMaxX && y >= glyphMinY && y <= glyphMaxY) {
            // Map pixel to glyph viewBox coordinates
            const glyphLocalX = (x - glyphMinX) / scaledGlyphSize;
            const glyphLocalY = (y - glyphMinY) / scaledGlyphSize;
            const glyphX = glyphLocalX * GLYPH_VIEWBOX_SIZE;
            const glyphY = glyphLocalY * GLYPH_VIEWBOX_SIZE;

            // Check page outline (cyan stroked rounded rect)
            const pageSDF = roundedRectSDF(
              glyphX, glyphY,
              PAGE.x, PAGE.y, PAGE.width, PAGE.height, PAGE.r
            );
            let onCyan = Math.abs(pageSDF) <= PAGE_STROKE_WIDTH / 2;

            // Check rings (cyan stroked circles, punched through with navy fill)
            let inRing = false;
            for (const ring of RINGS) {
              const dist = distanceFromCenter(glyphX, glyphY, ring.cx, ring.cy);
              const strokeBandWidth = RING_STROKE_WIDTH / 2;
              if (dist <= ring.r + strokeBandWidth) {
                inRing = true;
                onCyan = dist >= ring.r - strokeBandWidth;
                break;
              }
            }

            // Check bars (cyan ruled lines), drawn on top of everything else
            let onBar = false;
            for (const bar of BARS) {
              const dist = distanceToSegment(glyphX, glyphY, bar.x1, bar.y1, bar.x2, bar.y2);
              const strokeBandWidth = STROKE_WIDTH / 2;
              if (dist <= strokeBandWidth) {
                onBar = true;
                break;
              }
            }

            if (onBar || onCyan) {
              r = CYAN[0];
              g = CYAN[1];
              b = CYAN[2];
            } else if (inRing) {
              r = NAVY[0];
              g = NAVY[1];
              b = NAVY[2];
            }
          }
          // else: inside rounded rect but outside glyph area = navy background (already set)
        }
        // else: outside rounded rect = navy background (already set)
      }

      imageData.push(r, g, b);
    }
  }

  const imageBuffer = Buffer.from(imageData);
  const compressed = zlib.deflateSync(imageBuffer);

  // IHDR chunk (image header)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type (RGB)
  ihdr[10] = 0;  // compression method
  ihdr[11] = 0;  // filter method
  ihdr[12] = 0;  // interlace method

  const ihdrType = Buffer.from('IHDR');
  const ihdrData = Buffer.concat([ihdrType, ihdr]);
  const ihdrCrc = crc32(ihdrData);

  const ihdrChunk = Buffer.alloc(12 + 13);
  ihdrChunk.writeUInt32BE(13, 0);
  ihdrType.copy(ihdrChunk, 4);
  ihdr.copy(ihdrChunk, 8);
  ihdrChunk.writeUInt32BE(ihdrCrc, 21);

  // IDAT chunk (image data)
  const idatType = Buffer.from('IDAT');
  const idatData = Buffer.concat([idatType, compressed]);
  const idatCrc = crc32(idatData);

  const idatChunk = Buffer.alloc(12 + compressed.length);
  idatChunk.writeUInt32BE(compressed.length, 0);
  idatType.copy(idatChunk, 4);
  compressed.copy(idatChunk, 8);
  idatChunk.writeUInt32BE(idatCrc, 8 + compressed.length);

  // IEND chunk (image end)
  const iendType = Buffer.from('IEND');
  const iendData = Buffer.from('IEND');
  const iendCrc = crc32(iendData);

  const iendChunk = Buffer.alloc(12);
  iendChunk.writeUInt32BE(0, 0);
  iendType.copy(iendChunk, 4);
  iendChunk.writeUInt32BE(iendCrc, 8);

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

try {
  console.log('Generating Notes Diary PWA icons...\n');

  const icons = [
    { name: 'icon-192x192.png', size: 192, maskable: false },
    { name: 'icon-512x512.png', size: 512, maskable: false },
    { name: 'apple-touch-icon-180x180.png', size: 180, maskable: false },
    { name: 'icon-512x512-maskable.png', size: 512, maskable: true },
  ];

  icons.forEach(icon => {
    const png = createPNG(icon.size, icon.size, icon.maskable);
    fs.writeFileSync(`${ICON_DIR}/${icon.name}`, png);
    console.log(`✓ Generated ${icon.name} (${icon.size}x${icon.size}${icon.maskable ? ' maskable' : ''})`);
  });

  console.log('\n✓ All icons generated successfully!');
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
