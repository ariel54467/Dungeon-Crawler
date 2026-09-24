const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const root = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
function walk(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const frames = new Map();
const assets = new Map();
for (const file of walk('assets').filter(file => file.endsWith('.meta'))) {
  const meta = read(file);
  assets.set(meta.uuid, file.slice(0, -5));
  for (const [name, frame] of Object.entries(meta.subMetas || {})) {
    if (frame.importer === 'sprite-frame') frames.set(frame.uuid, { file, name });
  }
}

test('player clips keep body, hair, clothing and weapons in their own layers', () => {
  const prefixes = { Body: 'player_', 'Body/Hair': 'hair_', 'Body/Clothes': 'boxer_' };
  const clips = walk('assets/sprites/player/animations').filter(file => file.endsWith('.anim'));
  for (const file of clips) {
    const clip = read(file);
    assert.equal(clip._name, path.basename(file, '.anim'), file);
    const weapon = clip._name.split('_')[0];
    for (const [layer, prefix] of Object.entries({ ...prefixes, Weapon: weapon + '_' })) {
      const track = clip.curveData.paths[layer].comps['cc.Sprite'].spriteFrame;
      assert.ok(track.length, file + '/' + layer);
      for (const key of track) {
        const frame = frames.get(key.value.__uuid__);
        assert.ok(frame, file + ' missing UUID ' + key.value.__uuid__);
        assert.ok(path.basename(frame.file).startsWith(prefix), file + '/' + layer + ' uses ' + frame.file);
        assert.ok(key.frame < clip._duration, file + ' keyframe outside clip duration');
      }
    }
    const body = clip.curveData.paths.Body.comps['cc.Sprite'].spriteFrame;
    for (const layer of ['Body/Hair', 'Body/Clothes']) {
      const track = clip.curveData.paths[layer].comps['cc.Sprite'].spriteFrame;
      assert.deepEqual(track.map(k => [k.frame, frames.get(k.value.__uuid__).name]), body.map(k => [k.frame, frames.get(k.value.__uuid__).name]), file + ' unsynchronized ' + layer);
    }
  }
});

test('gameplay scenes bind every supported movement and attack clip', () => {
  for (const name of ['Home', 'HomeInside', 'Overworld', 'Dungeon_2', 'Game_Over', 'Game_Win']) {
    const scene = read('assets/scenes/' + name + '.fire');
    const player = scene.find(node => node && node.__type__ === 'cc.Node' && node._name === 'Player');
    const animation = player._components.map(ref => scene[ref.__id__]).find(c => c.__type__ === 'cc.Animation');
    const clips = animation._clips.map(ref => read(assets.get(ref.__uuid__))._name);
    for (const weapon of ['sword', 'axe', 'spear']) for (const action of ['idle', 'walk', 'attack', 'dead']) for (const direction of ['up', 'down', 'left', 'right']) {
      assert.ok(clips.includes([weapon, action, direction].join('_')), name + ' missing clip');
    }
    for (const ref of player._children) {
      const child = scene[ref.__id__];
      if (['Body', 'Weapon'].includes(child._name)) assert.equal(child._active, true);
    }
  }
});

test('weapon upgrades increase damage and reference supported prefixes', () => {
  const weapons = read('assets/resources/data/weapons.json');
  for (const weapon of ['sword', 'axe', 'spear']) {
    let damage = 0;
    for (let level = 1; level <= 3; level++) {
      const data = weapons[weapon + '_lvl_' + level];
      assert.equal(data.animPrefix, weapon);
      assert.ok(data.attack > damage);
      assert.ok(data.attackDuration > 0 && data.attackDuration <= data.attackCooldown);
      damage = data.attack;
    }
  }
});

test('overworld has one active inventory, avoiding competing equipment loads', () => {
  const scene = read('assets/scenes/Overworld.fire');
  const inventories = scene.filter(c => c && c.__type__ === 'a181aNBVQ9PVZjQ/U6l1Jq0' && scene[c.node.__id__]._active);
  assert.equal(inventories.length, 1);
});
