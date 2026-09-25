// Points every Texture Packer atlas at the PNG beside it and links its sprite frames to that texture.
// A plist naming a missing image imports frames without a texture, which renders them invisible.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'assets');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

let repaired = 0;
for (const plist of walk(root).filter(file => file.endsWith('.plist'))) {
  const image = path.basename(plist, '.plist') + '.png';
  const imageMeta = path.join(path.dirname(plist), image + '.meta');
  if (!fs.existsSync(imageMeta)) continue;
  const textureUuid = JSON.parse(fs.readFileSync(imageMeta, 'utf8')).uuid;

  const source = fs.readFileSync(plist, 'utf8');
  const fixed = source.replace(/(<key>(?:real)?[tT]extureFileName<\/key>\s*<string>)[^<]*(<\/string>)/g, '$1' + image + '$2');
  if (fixed !== source) fs.writeFileSync(plist, fixed);

  const metaFile = plist + '.meta';
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const before = JSON.stringify(meta);
  const linked = {};
  for (const [key, value] of Object.entries(meta)) {
    linked[key] = value;
    if (key === 'importer') linked.rawTextureUuid = textureUuid;
  }
  for (const frame of Object.values(linked.subMetas || {})) {
    const entries = Object.entries(frame).filter(([key]) => key !== 'rawTextureUuid');
    const index = entries.findIndex(([key]) => key === 'importer') + 1;
    entries.splice(index, 0, ['rawTextureUuid', textureUuid]);
    for (const key of Object.keys(frame)) delete frame[key];
    Object.assign(frame, Object.fromEntries(entries));
  }
  if (fixed !== source || JSON.stringify(linked) !== before) {
    fs.writeFileSync(metaFile, JSON.stringify(linked, null, 2));
    console.log('Linked ' + path.relative(root, plist) + ' to ' + image);
    repaired++;
  }
}
console.log(`Repaired ${repaired} atlas textures.`);
