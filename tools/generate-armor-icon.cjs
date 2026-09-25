// Draws the 32x32 armor inventory icon: a steel heater shield with a gold rim.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 32;
const WIDTH = 20;
const HEIGHT = 24;
const LEFT = (SIZE - WIDTH) / 2;
const TOP = 4;
const colors = {
  outline: [34, 30, 36],
  goldDark: [150, 104, 34],
  gold: [222, 172, 66],
  goldLight: [255, 222, 128],
  steelDark: [78, 88, 102],
  steel: [128, 140, 156],
  steelLight: [182, 194, 208],
  shine: [238, 244, 250],
};

function inside(x, y) {
  if (y < 0 || y >= HEIGHT) return false;
  const cx = x + 0.5 - WIDTH / 2;
  const cy = y + 0.5;
  const shoulder = HEIGHT * 0.42;
  let half = WIDTH / 2;
  if (cy > shoulder) half *= 1 - Math.pow((cy - shoulder) / (HEIGHT - shoulder), 1.7);
  return Math.abs(cx) <= half;
}

function depth(x, y) {
  let d = 0;
  while (d < 4 && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => inside(x + dx * (d + 1), y + dy * (d + 1)))) d++;
  return d;
}

function shade(x, y) {
  if (!inside(x, y)) return null;
  const d = depth(x, y);
  if (d === 0) return colors.outline;
  if (d === 1) return x < WIDTH / 2 ? colors.goldLight : colors.gold;
  if (d === 2) return colors.goldDark;
  const center = WIDTH / 2 - 0.5;
  if (Math.abs(x - center) < 1 && y > 3 && y < HEIGHT - 5) return x < center ? colors.shine : colors.steelDark;
  if (y > 6 && y < 9 && Math.abs(x - center) < 4) return colors.gold;
  if (x < center - 4 && y < HEIGHT * 0.55) return colors.steelLight;
  return x < center ? colors.steel : colors.steelDark;
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
const preview = [];
for (let y = 0; y < SIZE; y++) {
  let line = '';
  for (let x = 0; x < SIZE; x++) {
    const color = shade(x - LEFT, y - TOP);
    const offset = (y * SIZE + x) * 4;
    if (color) pixels.set([...color, 255], offset);
    line += color ? Object.keys(colors).find(key => colors[key] === color)[0] : '.';
  }
  preview.push(line);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8;
header[9] = 6;
const rows = [];
for (let y = 0; y < SIZE; y++) rows.push(Buffer.from([0]), pixels.subarray(y * SIZE * 4, (y + 1) * SIZE * 4));
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
  chunk('IEND', Buffer.alloc(0)),
]);
const output = path.join(__dirname, '..', 'assets', 'resources', 'Inventory', 'armor.png');
fs.writeFileSync(output, png);
console.log(preview.filter(line => /[^.]/.test(line)).join('\n'));
console.log('Wrote ' + path.relative(process.cwd(), output));
