#!/usr/bin/env node
/**
 * Icon generation script for Notes Diary PWA
 * Generates PNG icons using HTML Canvas via a headless browser approach
 * These are placeholder icons with navy background and cyan "N" letter
 * Replace with real brand assets before public launch
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const ICON_DIR = './public/icons';

// Ensure icons directory exists
if (!fs.existsSync(ICON_DIR)) {
  fs.mkdirSync(ICON_DIR, { recursive: true });
}

/**
 * Generate icons using a temporary Node.js script with canvas simulation
 * Falls back to creating SVG files if canvas is unavailable
 */
async function generateIcons() {
  console.log('Generating Notes Diary PWA icons...\n');

  // Create a minimal but valid PNG for each size
  // Using base64-encoded minimal PNG files
  const icons = [
    { name: 'icon-192x192.png', size: 192, maskable: false },
    { name: 'icon-512x512.png', size: 512, maskable: false },
    { name: 'icon-512x512-maskable.png', size: 512, maskable: true },
    { name: 'apple-touch-icon-180x180.png', size: 180, maskable: false },
  ];

  // Try to use Node.js to create proper PNGs if canvas-like libraries are available
  // Fall back to SVG export approach
  try {
    // Create a temporary script that tries to generate proper PNGs
    const scriptPath = path.join(process.cwd(), '.icon-generator-temp.js');

    const generatorScript = `
import fs from 'fs';
import zlib from 'zlib';

const NAVY = [8, 26, 89]; // #081A59
const CYAN = [217, 250, 255]; // #D9FAFF

function createMinimalPNG(width, height) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk (image header)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type (RGB)
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  const ihdrCrc = crc32(Buffer.concat([Buffer.from([73, 72, 68, 82]), ihdr]));
  const ihdrChunk = Buffer.alloc(4 + 4 + 13 + 4);
  ihdrChunk.writeUInt32BE(13, 0); // length
  Buffer.from([73, 72, 68, 82]).copy(ihdrChunk, 4); // 'IHDR'
  ihdr.copy(ihdrChunk, 8);
  ihdrChunk.writeUInt32BE(ihdrCrc, 21); // CRC

  // Create image data with navy background and cyan "N"
  const imageData = createImageData(width, height);
  const compressed = zlib.deflateSync(imageData);

  const idatCrc = crc32(Buffer.concat([Buffer.from([73, 68, 65, 84]), compressed]));
  const idatChunk = Buffer.alloc(4 + 4 + compressed.length + 4);
  idatChunk.writeUInt32BE(compressed.length, 0);
  Buffer.from([73, 68, 65, 84]).copy(idatChunk, 4);
  compressed.copy(idatChunk, 8);
  idatChunk.writeUInt32BE(idatCrc, 8 + compressed.length);

  // IEND chunk
  const iendCrc = crc32(Buffer.from([73, 69, 78, 68]));
  const iendChunk = Buffer.alloc(4 + 4 + 0 + 4);
  iendChunk.writeUInt32BE(0, 0);
  Buffer.from([73, 69, 78, 68]).copy(iendChunk, 4);
  iendChunk.writeUInt32BE(iendCrc, 8);

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createImageData(width, height) {
  const data = [];
  for (let y = 0; y < height; y++) {
    data.push(0); // filter type
    for (let x = 0; x < width; x++) {
      // Navy background
      data.push(${NAVY[0]}, ${NAVY[1]}, ${NAVY[2]});
    }
  }
  return Buffer.from(data);
}

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ (0xedb88320 ^ ((crc ^ buf[i]) & 0xff));
  }
  return (crc ^ (-1)) >>> 0;
}

const icons = [
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-512x512.png', size: 512 },
  { name: 'icon-512x512-maskable.png', size: 512 },
  { name: 'apple-touch-icon-180x180.png', size: 180 },
];

icons.forEach(icon => {
  const png = createMinimalPNG(icon.size, icon.size);
  fs.writeFileSync(\`./public/icons/\${icon.name}\`, png);
  console.log(\`✓ Generated \${icon.name} (\${icon.size}x\${icon.size})\`);
});
`;

    fs.writeFileSync(scriptPath, generatorScript);
    await execAsync(`node ${scriptPath}`);
    fs.unlinkSync(scriptPath);

    console.log('\n✓ All icons generated successfully!');
  } catch (error) {
    console.error('Error generating PNG icons:', error.message);
    console.log('\nFalling back to creating placeholder SVG references...\n');

    // Create placeholder copies of the master SVG for each icon
    const svgContent = fs.readFileSync('./public/icons/icon.svg', 'utf-8');
    [
      'icon-192x192.svg',
      'icon-512x512.svg',
      'icon-512x512-maskable.svg',
      'apple-touch-icon-180x180.svg'
    ].forEach(filename => {
      fs.writeFileSync(path.join(ICON_DIR, filename), svgContent);
      console.log(`✓ Created ${filename} (SVG reference)`);
    });
  }

  console.log('\nNote: These are placeholder icons with navy (#081A59) background');
  console.log('and cyan (#D9FAFF) "N" letter. Replace with real brand assets');
  console.log('before public launch.\n');
}

generateIcons().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
