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

test('built scenes only reference assets that exist', t => {
  // Built-in assets (default materials, button sprites) ship with the Cocos Creator install.
  const engine = process.env.COCOS_CREATOR_PATH || 'C:/ProgramData/cocos/editors/Creator/2.4.8';
  const builtins = path.join(engine, 'resources/static/default-assets');
  if (!fs.existsSync(builtins)) return t.skip('Cocos Creator 2.4.8 is not installed at ' + engine);
  const known = new Set();
  const collect = meta => {
    known.add(meta.uuid);
    for (const sub of Object.values(meta.subMetas || {})) collect(sub);
  };
  for (const file of walk('assets').filter(file => file.endsWith('.meta'))) collect(read(file));
  const walkAbsolute = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walkAbsolute(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  for (const file of walkAbsolute(builtins).filter(file => file.endsWith('.meta'))) collect(JSON.parse(fs.readFileSync(file, 'utf8')));
  const excluded = read('settings/builder.json').excludeScenes;
  for (const file of walk('assets/scenes').filter(file => file.endsWith('.fire'))) {
    if (excluded.includes(read(file + '.meta').uuid)) continue;
    const missing = new Set();
    for (const component of read(file)) {
      // Prefab links are editor-only and are not loaded by the game.
      if (component.__type__ === 'cc.PrefabInfo') continue;
      JSON.stringify(component, (key, value) => {
        if (value && value.__uuid__ && !known.has(value.__uuid__)) missing.add(component.__type__ + '.' + key + ' -> ' + value.__uuid__);
        return value;
      });
    }
    assert.deepEqual([...missing], [], file + ' references missing assets, so it cannot load');
  }
});

test('every atlas links its sprite frames to the image beside it', () => {
  for (const file of walk('assets').filter(file => file.endsWith('.plist.meta'))) {
    const image = path.basename(file, '.plist.meta') + '.png';
    const texture = read(path.join(path.dirname(file), image + '.meta')).uuid;
    const meta = read(file);
    assert.equal(meta.rawTextureUuid, texture, file + ' is not linked to ' + image);
    for (const [name, frame] of Object.entries(meta.subMetas)) {
      assert.equal(frame.rawTextureUuid, texture, file + ' frame ' + name + ' renders without an image');
    }
    const plist = fs.readFileSync(path.join(root, file.slice(0, -5)), 'utf8');
    for (const [, named] of plist.matchAll(/<key>(?:real)?[tT]extureFileName<\/key>\s*<string>([^<]*)</g)) {
      assert.equal(named, image, file + ' names a different image');
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

test('every inventory item has its own icon image', () => {
  const items = read('assets/resources/data/InventoryDatabase.json');
  for (const [name, item] of Object.entries(items)) {
    assert.ok(fs.existsSync(path.join(root, 'assets/resources', item.icon + '.png')), name + ' icon is missing');
  }
  assert.equal(new Set(Object.values(items).map(item => item.icon)).size, Object.keys(items).length, 'items share an icon');
});

test('the inventory shortcut button shows its bag icon in every scene that has it', () => {
  // The equipment button's icon is assigned at runtime from the equipped weapon.
  for (const name of ['Overworld', 'Dungeon_2']) {
    const scene = read('assets/scenes/' + name + '.fire');
    const nodePath = node => {
      const names = [];
      for (let current = node; current && current.__type__ === 'cc.Node'; current = current._parent && scene[current._parent.__id__]) names.unshift(current._name);
      return names.join('/');
    };
    const icon = scene.find(node => node && node.__type__ === 'cc.Node' && nodePath(node) === 'Canvas/UI/Inventory/GeneralButton/Icon');
    const sprite = icon._components.map(ref => scene[ref.__id__]).find(component => component.__type__ === 'cc.Sprite');
    assert.ok(sprite._spriteFrame, name + ' inventory button has no icon');
  }
});

test('equipment panels show weapon, armor and upgrade rows inside the panel without overlapping', () => {
  for (const name of ['Overworld', 'Dungeon_2']) {
    const scene = read('assets/scenes/' + name + '.fire');
    for (const panel of scene.filter(node => node && node.__type__ === 'cc.Node' && node._name === 'WeaponInventory')) {
      const child = childName => scene[panel._children.find(ref => scene[ref.__id__]._name === childName).__id__];
      const span = (node, height) => [node._trs.array[1] - height / 2, node._trs.array[1] + height / 2];
      const background = child('Background');
      const panelSpan = span(background, background._contentSize.height);
      // Top to bottom: caption and slot for weapons, then armor, then the level label and upgrade button.
      const rows = [];
      for (const kind of ['Weapon', 'Armor']) {
        const slot = child(kind + 'Slot');
        const grid = child(kind + 'Grid');
        assert.equal(slot._active && grid._active, true, name + ' hides the ' + kind.toLowerCase() + ' row');
        const caption = scene[scene[slot._children[0].__id__]._children[0].__id__];
        const captionSize = caption._components.map(ref => scene[ref.__id__]).find(c => c.__type__ === 'cc.Label')._fontSize + 4;
        rows.push([kind + ' caption', span({ _trs: { array: [0, slot._trs.array[1] + caption._trs.array[1]] } }, captionSize)]);
        rows.push([kind + ' row', span(slot, Math.max(slot._contentSize.height, grid._contentSize.height))]);
      }
      const level = child('Label');
      rows.push(['level label', span(level, level._components.map(ref => scene[ref.__id__]).find(c => c.__type__ === 'cc.Label')._fontSize + 4)]);
      rows.push(['upgrade button', span(child('BuyButton'), child('BuyButton')._contentSize.height)]);
      rows.forEach(([label, [bottom, top]], index) => {
        assert.ok(bottom >= panelSpan[0] && top <= panelSpan[1], name + ' ' + label + ' sticks out of the panel');
        if (index) assert.ok(top <= rows[index - 1][1][0], name + ' ' + label + ' overlaps ' + rows[index - 1][0]);
      });
    }
  }
});

test('overworld has one active inventory, avoiding competing equipment loads', () => {
  const scene = read('assets/scenes/Overworld.fire');
  const inventories = scene.filter(c => c && c.__type__ === 'a181aNBVQ9PVZjQ/U6l1Jq0' && scene[c.node.__id__]._active);
  assert.equal(inventories.length, 1);
});

test('dungeon menus expose every level with clickable bounds matching their backgrounds', () => {
  for (const file of ['assets/scenes/Overworld.fire', 'assets/prefabs/map/PopUpDungeon.prefab']) {
    const scene = read(file);
    const popup = scene.find(c => c.__type__ === '55b252R4/JPMqM0oJXTyk5j');
    const positions = new Set();
    for (let level = 1; level <= 3; level++) {
      const ref = popup['level' + level + 'Button'];
      assert.ok(ref, file + ' must bind level ' + level);
      const button = scene[ref.__id__];
      assert.equal(button.__type__, 'cc.Button');
      const node = scene[button.node.__id__];
      assert.equal(node._active, true);
      assert.equal(node._parent.__id__, popup.node.__id__);
      positions.add(node._trs.array[1]);
      const background = scene[button['_N$target'].__id__];
      assert.deepEqual(node._contentSize, background._contentSize, file + ' has an unclickable button edge');
      const labelNode = scene[background._children[0].__id__];
      const label = labelNode._components.map(ref => scene[ref.__id__]).find(c => c.__type__ === 'cc.Label');
      assert.equal(label._string, 'LEVEL ' + level);
    }
    assert.equal(positions.size, 3, file + ' has overlapping level controls');
  }
});

test('dungeon encounter includes all three configured enemies', () => {
  const scene = read('assets/scenes/Dungeon_2.fire');
  const enemies = scene.filter(c => c.__type__ === 'f3070rCmrVD+J/ym9NvIN64');
  assert.equal(enemies.length, 3);
  for (const enemy of enemies) {
    assert.equal(enemy._enabled, true);
    assert.equal(scene[enemy.node.__id__]._active, true);
  }
});

test('production scenes have valid local references and attached script classes', () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function scriptId(uuid) {
    const hex = uuid.replaceAll('-', '');
    let id = hex.slice(0, 5);
    for (let i = 5; i < hex.length; i += 3) {
      const value = parseInt(hex.slice(i, i + 3), 16);
      id += alphabet[value >> 6] + alphabet[value & 63];
    }
    return id;
  }
  const scripts = new Map(walk('assets/scripts').filter(file => file.endsWith('.js.meta')).map(file => {
    return [scriptId(read(file).uuid), file.slice(0, -5)];
  }));
  const build = read('settings/builder.json');
  const sceneId = name => read('assets/scenes/' + name + '.fire.meta').uuid;
  assert.ok(build.excludeScenes.includes(sceneId('testing')), 'Exclude the testing sandbox from builds');
  assert.ok(!build.excludeScenes.includes(sceneId('CharacterCustomization')), 'Build the character creation screen');
  for (const file of walk('assets/scenes').filter(file => file.endsWith('.fire'))) {
    if (build.excludeScenes.includes(read(file + '.meta').uuid)) continue;
    const scene = read(file);
    for (const [index, component] of scene.entries()) {
      assert.ok(component.__type__.startsWith('cc.') || scripts.has(component.__type__), file + ' missing script at ' + index);
      JSON.stringify(component, (key, value) => {
        if (value && value.__id__ !== undefined) assert.ok(scene[value.__id__], file + ' has invalid reference at ' + index);
        return value;
      });
      if (component.__type__ !== 'cc.ClickEvent') continue;
      const target = scene[component.target.__id__];
      const script = scripts.get(component._componentId);
      assert.ok(script, file + ' missing button script');
      assert.ok(target._components.some(ref => scene[ref.__id__].__type__ === component._componentId), file + ' button target is missing its script');
      assert.ok(fs.readFileSync(path.join(root, script), 'utf8').includes(component.handler + '('), file + ' missing button handler ' + component.handler);
    }
  }
});
