#!/usr/bin/env node
/**
 * Simple PNG icon generator for Notes Diary PWA
 * Creates minimal valid PNG files directly
 * Placeholder icons: navy background (#081A59) with cyan "N" (#D9FAFF)
 * Replace with real brand assets before public launch
 */

import fs from 'fs';
import zlib from 'zlib';
import { createHash } from 'crypto';

const ICON_DIR = './public/icons';
const NAVY = [8, 26, 89];
const CYAN = [217, 250, 255];

function createPNG(width, height) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // Helper to create CRC
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

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type (RGB)
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const ihdrType = Buffer.from('IHDR');
  const ihdrData = Buffer.concat([ihdrType, ihdr]);
  const ihdrCrc = crc32(ihdrData);

  const ihdrChunk = Buffer.alloc(12 + 13);
  ihdrChunk.writeUInt32BE(13, 0);
  ihdrType.copy(ihdrChunk, 4);
  ihdr.copy(ihdrChunk, 8);
  ihdrChunk.writeUInt32BE(ihdrCrc, 21);

  // Create image data
  const imageData = [];
  for (let y = 0; y < height; y++) {
    imageData.push(0); // filter type
    for (let x = 0; x < width; x++) {
      // Navy background with text in center area
      const centerX = width / 2;
      const centerY = height / 2;
      const dx = Math.abs(x - centerX);
      const dy = Math.abs(y - centerY);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const threshold = Math.min(width, height) * 0.3;

      if (dist < threshold) {
        // Draw cyan "N" in center (simple square pattern for now)
        imageData.push(CYAN[0], CYAN[1], CYAN[2]);
      } else {
        // Navy background
        imageData.push(NAVY[0], NAVY[1], NAVY[2]);
      }
    }
  }

  const imageBuffer = Buffer.from(imageData);
  const compressed = zlib.deflateSync(imageBuffer);

  const idatType = Buffer.from('IDAT');
  const idatData = Buffer.concat([idatType, compressed]);
  const idatCrc = crc32(idatData);

  const idatChunk = Buffer.alloc(12 + compressed.length);
  idatChunk.writeUInt32BE(compressed.length, 0);
  idatType.copy(idatChunk, 4);
  compressed.copy(idatChunk, 8);
  idatChunk.writeUInt32BE(idatCrc, 8 + compressed.length);

  // IEND chunk
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
    { name: 'icon-192x192.png', size: 192 },
    { name: 'icon-512x512.png', size: 512 },
    { name: 'icon-512x512-maskable.png', size: 512 },
    { name: 'apple-touch-icon-180x180.png', size: 180 },
  ];

  icons.forEach(icon => {
    const png = createPNG(icon.size, icon.size);
    fs.writeFileSync(`${ICON_DIR}/${icon.name}`, png);
    console.log(`✓ Generated ${icon.name} (${icon.size}x${icon.size})`);
  });

  // Clean up SVG references since we have PNGs now
  const svgFiles = fs.readdirSync(ICON_DIR).filter(f => f.endsWith('.svg'));
  svgFiles.forEach(f => {
    fs.unlinkSync(`${ICON_DIR}/${f}`);
  });

  console.log('\n✓ All icons generated successfully!');
  console.log('\nNote: These are placeholder icons with navy (#081A59) background');
  console.log('and cyan (#D9FAFF) content. Replace with real brand assets');
  console.log('before public launch.\n');
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
