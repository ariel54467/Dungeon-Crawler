// Downscales UI images that were exported far larger than they are ever drawn, to cut download size.
// Every sprite using these images has a fixed (custom) size in the scenes, so the layout does not change.
// Images already within their limit are left untouched, so the script is safe to re-run.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..', 'assets');
// Longest side in pixels: at least twice the largest size each image is drawn at.
const LIMITS = {
  'Images/StartGameButton.png': 600,
  'resources/Inventory/bag.png': 128,
  'resources/Inventory/BackgroundBox.png': 640,
  'assets/forest_frame_transparent_clean.png': 256,
  // Character creation frames, drawn at 410x410 and 92x124 (fixed sizes set by repair-scene-bindings.cjs).
  'Images/Box.png': 820,
  'Images/player_preview_box_sky_clouds_rocks_transparent.png': 256,
};

function decode(file) {
  const data = fs.readFileSync(file);
  let offset = 8;
  let header;
  let palette;
  let transparency;
  const compressed = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const body = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = body;
    if (type === 'PLTE') palette = body;
    if (type === 'tRNS') transparency = body;
    if (type === 'IDAT') compressed.push(body);
    offset += 12 + length;
  }
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header[8];
  const colorType = header[9];
  if (depth !== 8 || header[12] !== 0) throw new Error(file + ': only 8-bit, non-interlaced PNGs are supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  const rgba = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      line[i] = value & 255;
    }
    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4;
      const source = x * channels;
      if (colorType === 3) {
        const index = line[source];
        rgba.set([palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2], transparency && index < transparency.length ? transparency[index] : 255], target);
      } else if (colorType === 0 || colorType === 4) {
        rgba.set([line[source], line[source], line[source], colorType === 4 ? line[source + 1] : 255], target);
      } else {
        rgba.set([line[source], line[source + 1], line[source + 2], colorType === 6 ? line[source + 3] : 255], target);
      }
    }
    previous = line;
  }
  return { width, height, rgba };
}

// Area-average resampling with premultiplied alpha, so transparent edges do not darken.
function resize({ width, height, rgba }, newWidth, newHeight) {
  const out = Buffer.alloc(newWidth * newHeight * 4);
  const scaleX = width / newWidth;
  const scaleY = height / newHeight;
  for (let y = 0; y < newHeight; y++) {
    const y0 = y * scaleY;
    const y1 = y0 + scaleY;
    for (let x = 0; x < newWidth; x++) {
      const x0 = x * scaleX;
      const x1 = x0 + scaleX;
      let r = 0, g = 0, b = 0, a = 0, total = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const weight = wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
          const i = (sy * width + sx) * 4;
          const alpha = rgba[i + 3] * weight;
          r += rgba[i] * alpha;
          g += rgba[i + 1] * alpha;
          b += rgba[i + 2] * alpha;
          a += alpha;
          total += weight;
        }
      }
      const o = (y * newWidth + x) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      // Keep barely visible pixels visible: Cocos trims fully transparent edges and stretches the rest
      // to fill the sprite, so losing them would change how the image is drawn.
      out[o + 3] = a > 0 ? Math.max(1, Math.round(a / total)) : 0;
    }
  }
  return { width: newWidth, height: newHeight, rgba: out };
}

function encode({ width, height, rgba }) {
  const stride = width * 4;
  const rows = [];
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const line = rgba.subarray(y * stride, (y + 1) * stride);
    // Pick the PNG row filter that leaves the smallest residuals, which compresses best.
    let best;
    let bestScore = Infinity;
    for (let filter = 0; filter <= 4; filter++) {
      const row = Buffer.alloc(stride + 1);
      row[0] = filter;
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const left = i >= 4 ? line[i - 4] : 0;
        const up = previous[i];
        const upLeft = i >= 4 ? previous[i - 4] : 0;
        let predictor = 0;
        if (filter === 1) predictor = left;
        else if (filter === 2) predictor = up;
        else if (filter === 3) predictor = (left + up) >> 1;
        else if (filter === 4) {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        }
        const value = (line[i] - predictor) & 255;
        row[i + 1] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) {
        bestScore = score;
        best = row;
      }
    }
    rows.push(best);
    previous = line;
  }
  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [relative, limit] of Object.entries(LIMITS)) {
  const file = path.join(root, relative);
  const before = fs.statSync(file).size;
  const image = decode(file);
  const longest = Math.max(image.width, image.height);
  if (longest <= limit) {
    console.log(`${relative}: already ${image.width}x${image.height}, skipped`);
    continue;
  }
  const scale = limit / longest;
  const resized = resize(image, Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
  const png = encode(resized);
  fs.writeFileSync(file, png);
  console.log(`${relative}: ${image.width}x${image.height} ${Math.round(before / 1024)}KB -> ${resized.width}x${resized.height} ${Math.round(png.length / 1024)}KB`);
}
