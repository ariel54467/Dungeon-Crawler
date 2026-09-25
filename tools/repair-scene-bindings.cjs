const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..', 'assets', 'scenes');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name + '.fire')));
const source = read('Overworld');
function playerAnimation(scene) {
  const player = scene.find(node => node && node.__type__ === 'cc.Node' && node._name === 'Player');
  return player._components.map(ref => scene[ref.__id__]).find(component => component.__type__ === 'cc.Animation');
}

// Keep the scene's popup complete even when an old prefab instance lost children.
function cloneNodeTree(scene, rootId) {
  const ids = [];
  function collect(id) {
    const node = scene[id];
    ids.push(id, ...node._components.map(ref => ref.__id__));
    node._children.forEach(ref => collect(ref.__id__));
  }
  collect(rootId);
  const remap = new Map(ids.map((id, index) => [id, scene.length + index]));
  const copies = ids.map(id => JSON.parse(JSON.stringify(scene[id]), (key, value) => {
    if (key === '_prefab') return null;
    if (key === '_id') return crypto.randomUUID();
    if (value && remap.has(value.__id__)) return { __id__: remap.get(value.__id__) };
    return value;
  }));
  scene.push(...copies);
  return remap.get(rootId);
}

function configureDungeonPopup(scene) {
  const popup = scene.find(node => node.__type__ === 'cc.Node' && node._name === 'PopUpDungeon');
  const popupId = scene.indexOf(popup);
  const controller = popup._components.map(ref => scene[ref.__id__]).find(c => c.__type__ === '55b252R4/JPMqM0oJXTyk5j');
  const firstButton = scene[controller.level1Button.__id__];
  for (let level = 2; level <= 3; level++) {
    if (controller['level' + level + 'Button']) continue;
    const nodeId = cloneNodeTree(scene, firstButton.node.__id__);
    const node = scene[nodeId];
    node._name = 'Level ' + level;
    node._parent = { __id__: popupId };
    popup._children.push({ __id__: nodeId });
    controller['level' + level + 'Button'] = node._components.find(ref => scene[ref.__id__].__type__ === 'cc.Button');
  }
  popup._trs.array[7] = popup._trs.array[8] = 0.4;
  for (let level = 1; level <= 3; level++) {
    configureButton(controller['level' + level + 'Button'], 'LEVEL ' + level, 400, 60, 220 - (level - 1) * 160);
  }
  configureButton(controller.closeButton, 'CLOSE', 200, 55, -350);
  const background = popup._children.map(ref => scene[ref.__id__]).find(node => node._name === 'Background');
  background._trs.array[0] = 0;
  const titleNode = scene[background._children[0].__id__];
  titleNode._trs.array[0] = 0;
  titleNode._contentSize.width = 700;
  const title = titleNode._components.map(ref => scene[ref.__id__]).find(c => c.__type__ === 'cc.Label');
  title._string = title['_N$string'] = 'DUNGEON LEVEL';
  title['_N$horizontalAlign'] = 1;
  title['_N$file'] = null;
  title._isSystemFontUsed = true;

  function configureButton(ref, text, width, height, y) {
    const button = scene[ref.__id__];
    const node = scene[button.node.__id__];
    node._trs.array[0] = 0;
    node._trs.array[1] = y;
    node._contentSize.width = width;
    node._contentSize.height = height;
    const background = scene[button['_N$target'].__id__];
    background._contentSize.width = width;
    background._contentSize.height = height;
    const widget = background._components.map(ref => scene[ref.__id__]).find(c => c.__type__ === 'cc.Widget');
    if (widget) widget._left = widget._right = 0;
    const labelNode = scene[background._children[0].__id__];
    labelNode._contentSize.width = width;
    labelNode._contentSize.height = height;
    const label = labelNode._components.map(ref => scene[ref.__id__]).find(c => c.__type__ === 'cc.Label');
    label._string = label['_N$string'] = text;
    label._fontSize = 36;
    label['_N$file'] = null;
    label._isSystemFontUsed = true;
  }
}

for (const file of [path.join(root, 'Overworld.fire'), path.join(root, '..', 'prefabs', 'map', 'PopUpDungeon.prefab')]) {
  const scene = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = JSON.stringify(scene);
  configureDungeonPopup(scene);
  if (JSON.stringify(scene) !== before) {
    fs.writeFileSync(file, JSON.stringify(scene, null, 2) + '\n');
    console.log('Repaired dungeon menu in ' + path.basename(file));
  }
}

const dungeon = read('Dungeon_2');
const goblin = dungeon.find(node => node.__type__ === 'cc.Node' && node._name === 'Goblin');
if (!goblin._active) {
  goblin._active = true;
  fs.writeFileSync(path.join(root, 'Dungeon_2.fire'), JSON.stringify(dungeon, null, 2) + '\n');
  console.log('Restored the third dungeon enemy.');
}
// Bosses wind up their heavy swing for longer and are too heavy to knock back.
// The dungeon boss used to chase at half its patrol speed and never reached the player.
const ENEMY_CONTROLLER = 'f622d58LdBJgKwewAW+YA/h';
for (const [name, tuning] of [['Overworld', {}], ['Dungeon_2', { chaseSpeed: 30 }]]) {
  const scene = read(name);
  const before = JSON.stringify(scene);
  for (const boss of scene.filter(node => node && node.__type__ === 'cc.Node' && node._name === 'GoblinBoss')) {
    const controller = boss._components.map(ref => scene[ref.__id__]).find(component => component.__type__ === ENEMY_CONTROLLER);
    Object.assign(controller, { attackWindup: 0.6, knockbackSpeed: 0 }, tuning);
  }
  if (JSON.stringify(scene) !== before) {
    fs.writeFileSync(path.join(root, name + '.fire'), JSON.stringify(scene, null, 2) + '\n');
    console.log('Tuned the boss in ' + name);
  }
}

// The Overworld's inventory (bag) button lost its icon; reuse the dungeon's identical button art.
function sprite(scene, nodePath) {
  const node = scene.find(candidate => {
    if (!candidate || candidate.__type__ !== 'cc.Node') return false;
    const names = [];
    for (let current = candidate; current && current.__type__ === 'cc.Node'; current = current._parent && scene[current._parent.__id__]) names.unshift(current._name);
    return names.join('/') === nodePath;
  });
  return node && node._components.map(ref => scene[ref.__id__]).find(component => component.__type__ === 'cc.Sprite');
}
const bagIcon = 'Canvas/UI/Inventory/GeneralButton/Icon';
const overworld = read('Overworld');
const overworldBag = sprite(overworld, bagIcon);
if (!overworldBag._spriteFrame) {
  overworldBag._spriteFrame = sprite(read('Dungeon_2'), bagIcon)._spriteFrame;
  fs.writeFileSync(path.join(root, 'Overworld.fire'), JSON.stringify(overworld, null, 2) + '\n');
  console.log('Restored the Overworld inventory button icon.');
}

// The equipment panel's armor row was switched off because the upgrade controls were placed on top of it.
// Restack the panel (240 units tall) so weapons, armor and the upgrade controls each get their own row.
const EQUIPMENT_ROWS = { WeaponSlot: 40, WeaponGrid: 40, ArmorSlot: -18, ArmorGrid: -18, Label: -52, BuyButton: -92 };
const panelFiles = [
  path.join(root, 'Overworld.fire'),
  path.join(root, 'Dungeon_2.fire'),
  path.join(root, '..', 'prefabs', 'inventory', 'Inventory - 001.prefab'),
  path.join(root, '..', 'prefabs', 'inventory', 'Inventory.prefab'),
];
for (const file of panelFiles) {
  const scene = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = JSON.stringify(scene);
  for (const panel of scene.filter(node => node && node.__type__ === 'cc.Node' && node._name === 'WeaponInventory')) {
    for (const ref of panel._children) {
      const child = scene[ref.__id__];
      if (!(child._name in EQUIPMENT_ROWS)) continue;
      child._trs.array[1] = EQUIPMENT_ROWS[child._name];
      if (child._name.startsWith('Armor')) child._active = true;
    }
  }
  if (JSON.stringify(scene) !== before) {
    fs.writeFileSync(file, JSON.stringify(scene, null, 2) + '\n');
    console.log('Restored the armor row in ' + path.basename(file));
  }
}

// Character customization: its controller script was deleted (CharacterCustomization.js restores it under the
// same id), its label font and two images no longer exist, and a goblin AI was left on the preview character.
{
  const CUSTOMIZATION = 'ccb53hcxW1MH5H1wp+ahwgh';
  const MISSING_FONT = 'a4b32353-5cb0-4c56-bf71-ee124e5793b8';
  const ARCADE_FONT = 'd26e794b-4fa7-44e5-9846-3c625be3622e';
  // Idle, facing down: the same frames the player uses in game.
  const IDLE = { body: '1e75b91b-988b-4aeb-89df-5e871ea742ea', hair: '921e6e64-cc26-4e05-977f-5f7bbce15e9c', outfit: '40bcdba7-1201-40ee-9f03-d8771d688e67' };
  const scene = read('CharacterCustomization');
  const before = JSON.stringify(scene);
  for (const label of scene.filter(c => c && c.__type__ === 'cc.Label' && c._N$file && c._N$file.__uuid__ === MISSING_FONT)) {
    label._N$file = { __uuid__: ARCADE_FONT };
  }
  const controller = scene.find(c => c && c.__type__ === CUSTOMIZATION);
  scene[controller.bodySprite.__id__]._spriteFrame = { __uuid__: IDLE.body };
  scene[controller.hairSprite.__id__]._spriteFrame = { __uuid__: IDLE.hair };
  scene[controller.outfitSprite.__id__]._spriteFrame = { __uuid__: IDLE.outfit };
  controller.hairStyles = [{ __uuid__: IDLE.hair }];
  controller.outfitStyles = [{ __uuid__: IDLE.outfit }];
  controller.nameBox = { __id__: scene.findIndex(c => c && c.__type__ === 'cc.EditBox') };
  const confirm = scene.find(node => node && node.__type__ === 'cc.Node' && node._name === 'New Button');
  controller.confirmButton = confirm._components.find(ref => scene[ref.__id__].__type__ === 'cc.Button');
  const stray = scene[controller.node.__id__]._components.map(ref => scene[ref.__id__]).find(c => c.__type__ === ENEMY_CONTROLLER);
  if (stray) stray._enabled = false;
  // Keep the two big frames at their current on-screen size, so tools/optimize-images.cjs can shrink their files.
  for (const name of ['Customization Box', 'Player Preview Box']) {
    const node = scene.find(candidate => candidate && candidate.__type__ === 'cc.Node' && candidate._name === name);
    node._components.map(ref => scene[ref.__id__]).find(c => c.__type__ === 'cc.Sprite')._sizeMode = 0;
  }
  if (JSON.stringify(scene) !== before) {
    fs.writeFileSync(path.join(root, 'CharacterCustomization.fire'), JSON.stringify(scene, null, 2) + '\n');
    console.log('Repaired CharacterCustomization');
  }
}

const clips = playerAnimation(source)._clips;
for (const name of ['Home', 'HomeInside', 'testing']) {
  const scene = read(name);
  const before = JSON.stringify(scene);
  playerAnimation(scene)._clips = clips;
  if (name === 'HomeInside') {
    const trigger = scene.find(node => node && node._name === 'SaveTrigger');
    const body = trigger._components.map(ref => scene[ref.__id__]).find(component => component.__type__ === 'cc.RigidBody');
    body.enabledContactListener = true;
  }
  if (JSON.stringify(scene) !== before) {
    fs.writeFileSync(path.join(root, name + '.fire'), JSON.stringify(scene, null, 2) + '\n');
    console.log('Repaired bindings in ' + name);
  }
}
