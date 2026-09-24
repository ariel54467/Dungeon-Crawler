const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'assets', 'sprites');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const atlases = new Map();
for (const file of walk(root).filter(file => file.endsWith('.plist.meta'))) {
  atlases.set(path.basename(file, '.plist.meta'), JSON.parse(fs.readFileSync(file)).subMetas);
}
function keyframes(atlas, indices, times) {
  return indices.map((index, i) => {
    const key = String(index).padStart(2, '0') + '.png';
    const frame = atlases.get(atlas)[key];
    if (!frame) throw new Error(`Missing ${atlas}/${key}`);
    return { frame: times[i], value: { __uuid__: frame.uuid } };
  });
}

// Keep each visual layer on its own node; draw order belongs to the controller.
let changed = 0;
for (const file of walk(path.join(root, 'player', 'animations')).filter(file => file.endsWith('.anim'))) {
  const original = fs.readFileSync(file, 'utf8');
  const clip = JSON.parse(original);
  const name = path.basename(file, '.anim');
  const [weapon, action, direction] = name.split('_');
  const offset = { down: 0, up: 8, right: 16, left: 24 }[direction];
  let suffix, indices, weaponSuffix;
  if (action === 'walk' || action === 'run') {
    suffix = weapon === 'spear' ? 'p1b' : 'p1';
    indices = (action === 'walk' ? [32, 33, 38, 35, 36, 39] : [38, 39]).map(i => i + offset);
    weaponSuffix = weapon === 'spear' ? 'p1b' : 'p1_lvl_1';
  } else if (action === 'idle') {
    suffix = 'p4';
    indices = [33 + offset, 34 + offset];
    weaponSuffix = weapon === 'spear' ? 'p1b' : 'p1_lvl_1';
  } else {
    suffix = 'atk_melee_' + (action === 'attack' ? 'p3' : 'p1') + (weapon === 'spear' ? 'b' : '');
    const base = weapon === 'axe' ? 4 : weapon === 'spear' ? 32 : 0;
    indices = (action === 'attack' ? (weapon === 'spear' ? [base, base + 1, base + 2] : [base, base + 1, base + 2, base + 3]) : action === 'hurt' ? [5] : [6, 7]).map(i => i + offset);
    weaponSuffix = suffix;
  }
  const times = action === 'idle' ? [0, 1] : indices.map((_, i) => i / clip.sample);
  const hairSuffix = suffix === 'p1' || suffix === 'p4' ? suffix + '_1' : suffix;
  const layers = {
    Body: ['player_' + suffix, indices],
    'Body/Hair': ['hair_' + hairSuffix, indices],
    'Body/Clothes': ['boxer_' + suffix, indices],
    Weapon: [weapon + '_' + weaponSuffix, action === 'idle' ? [offset, offset] : indices],
  };
  clip._name = name;
  clip.wrapMode = ['walk', 'idle', 'run'].includes(action) ? 2 : 1;
  for (const [layer, [atlas, frames]] of Object.entries(layers)) {
    clip.curveData.paths[layer] = { comps: { 'cc.Sprite': { spriteFrame: keyframes(atlas, frames, times) } } };
  }
  if (JSON.stringify(clip) !== JSON.stringify(JSON.parse(original))) {
    fs.writeFileSync(file, JSON.stringify(clip, null, 2) + '\n');
    changed++;
  }
}
console.log(`Repaired ${changed} player animation clips.`);
