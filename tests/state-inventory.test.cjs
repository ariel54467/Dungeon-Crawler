const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { gameRequire } = require('./game-require.cjs');

const root = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

function runtime(saved = {}) {
  const storage = new Map(Object.entries(saved));
  const pending = [];
  const schedules = [];
  const warnings = [];
  const components = {};
  let definition;
  const player = {
    activeInHierarchy: true,
    on() {}, off() {}, emit() {},
    getComponent: name => components[name],
  };
  const scene = {
    name: 'Home',
    getComponentInChildren: name => components[name],
    getComponentsInChildren: name => components[name] ? [components[name]] : [],
  };
  const cc = {
    Class: value => { definition = value; },
    Component: function () {}, Node: function () {}, Prefab: function () {},
    Label: function () {}, Button: function () {}, Sprite: function () {}, JsonAsset: function () {},
    v2: (x = 0, y = 0) => ({ x, y }), color: (...values) => values,
    isValid: value => !!value && !value.destroyed,
    warn: (...args) => warnings.push(args), error: (...args) => warnings.push(args),
    find: name => name === 'Canvas/Player' ? player : null,
    sys: { localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } },
    resources: { load: (name, type, callback) => pending.push({ name, callback }) },
    director: {
      getCollisionManager: () => ({}), getPhysicsManager: () => ({}),
      getScene: () => scene,
      loadScene: name => { scene.name = name; return true; },
    },
  };
  const context = vm.createContext({ cc });
  context.require = gameRequire(cc);
  const create = (name, file) => {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    const instance = {};
    for (const [key, value] of Object.entries(definition.properties || {})) {
      if (typeof value === 'function') instance[key] = null;
      else instance[key] = value && typeof value === 'object' && 'default' in value ? value.default : value;
    }
    for (const [key, value] of Object.entries(definition)) if (typeof value === 'function') instance[key] = value;
    instance.node = name === 'PlayerStats' ? player : { activeInHierarchy: true, addComponent() {} };
    instance.scheduleOnce = callback => schedules.push(callback);
    components[name] = instance;
    return instance;
  };
  const flush = name => {
    const index = pending.findIndex(request => request.name === name);
    assert.notEqual(index, -1, 'expected pending resource ' + name);
    pending.splice(index, 1)[0].callback(null, { json: read('assets/resources/' + name + '.json') });
  };
  const stats = create('PlayerStats', 'assets/scripts/controllers/player/PlayerStats.js');
  stats.onLoad();
  if (pending.some(request => request.name === 'data/PlayerState')) flush('data/PlayerState');
  flush('data/weapons');
  const inventory = create('InventoryManager', 'assets/scripts/managers/InventoryManager.js');
  inventory.onLoad();
  const manager = create('GameManager', 'assets/scripts/core/GameManager.js');
  manager.onLoad();
  manager.start();
  return { cc, components, storage, pending, schedules, warnings, scene, stats, inventory, manager, flush };
}

test('saved counters and dungeon levels are finite, nonnegative integers', () => {
  const { manager } = runtime({
    SavedGameState: JSON.stringify({ playTime: -4, killCount: 'Infinity', deathCount: 3.9 }),
    currentDungeonLevel: '2.9',
  });
  assert.equal(manager.playtime, 0);
  assert.equal(manager.killcount, 0);
  assert.equal(manager.deathcount, 3);
  assert.equal(manager.currentDungeonLevel, 2);
});

test('play time excludes player loading, menus, death and scene changes', () => {
  const { stats, manager, inventory } = runtime();
  stats.ready = false;
  manager.update(2);
  stats.ready = true;
  inventory.generalInventory = { activeInHierarchy: true };
  manager.update(2);
  inventory.generalInventory.activeInHierarchy = false;
  stats._dead = true;
  manager.update(2);
  stats._dead = false;
  manager._transitioning = true;
  manager.update(2);
  manager._transitioning = false;
  manager.update(1.25);
  manager.update(0.75);
  assert.equal(manager.playtime, 2);
});

test('loot earned before inventory loads survives initialization and saving', () => {
  const game = runtime();
  const { manager, stats, inventory, flush, storage } = game;
  assert.equal(inventory.ready, false);
  manager.enemyDefeated({ node: { name: 'Goblin' } });
  manager.enemyDefeated({ node: { name: 'Goblin' } });
  assert.equal(stats.savedItems.find(item => item.name === 'heal_potion').quantity, 4);
  assert.equal(manager.saveAllGameData(), true);
  flush('data/InventoryDatabase');
  assert.equal(inventory.ready, true);
  const index = inventory.items.findIndex(item => item && inventory._definition(item).name === 'heal_potion');
  assert.equal(inventory.items[index].quantity, 4);
  stats.hp = 40;
  inventory.onSlotClick(null, index);
  inventory.onUseButtonClick();
  assert.equal(stats.hp, 70);
  const restored = runtime(Object.fromEntries(storage));
  assert.equal(restored.stats.savedItems.find(item => item.name === 'heal_potion').quantity, 3);
  assert.equal(restored.stats.hp, 70);
  assert.equal(restored.manager.killcount, 2);
});

test('inventory cannot erase saved items before it is ready', () => {
  const { stats, inventory } = runtime();
  const before = JSON.stringify(stats.savedItems);
  inventory.syncPlayerState();
  assert.equal(JSON.stringify(stats.savedItems), before);
});

test('dead, victorious and transitioning players cannot spend gold or change inventory', () => {
  const { stats, inventory, manager, flush } = runtime();
  flush('data/InventoryDatabase');
  inventory.generalInventory = { active: false };
  stats.equippedArmor = 'armor';
  for (const state of ['death', 'transition', 'victory']) {
    stats._dead = state === 'death';
    manager._transitioning = state === 'transition';
    manager._won = state === 'victory';
    inventory.onUpgradeClick();
    inventory.toggleGeneralInventory();
    inventory.unequipArmor();
    assert.equal(stats.money, 250);
    assert.equal(stats.upgradeLevel, 1);
    assert.equal(stats.equippedArmor, 'armor');
    assert.equal(inventory.generalInventory.active, false);
  }
});

test('opening and closing inventory refreshes pause state immediately', () => {
  const { inventory, manager, flush } = runtime();
  flush('data/InventoryDatabase');
  inventory.generalInventory = { active: false, get activeInHierarchy() { return this.active; } };
  inventory.toggleGeneralInventory();
  assert.equal(manager.isPaused, true);
  inventory.hideInventory();
  assert.equal(manager.isPaused, false);
});

test('equipment icons ignore stale asynchronous loads and clear unequipped armor', () => {
  const { inventory, stats, flush } = runtime();
  flush('data/InventoryDatabase');
  const weaponIcon = { node: {}, spriteFrame: null };
  const armorIcon = { node: {}, spriteFrame: null };
  const callbacks = [];
  inventory.weaponSlot = { getChildByName: () => ({ getComponent: () => weaponIcon }) };
  inventory.armorSlot = { getChildByName: () => ({ getComponent: () => armorIcon }) };
  inventory.loadSprite = (path, callback) => callbacks.push(callback);
  stats.weapon = 'sword_lvl_1';
  inventory._updateEquippedIcon();
  stats.weapon = 'axe_lvl_1';
  inventory._updateEquippedIcon();
  callbacks[1]('axe');
  callbacks[0]('sword');
  assert.equal(weaponIcon.spriteFrame, 'axe');
  stats.equippedArmor = 'armor';
  inventory._updateArmorIcon();
  callbacks[2]('armor');
  assert.equal(armorIcon.spriteFrame, 'armor');
  inventory.unequipArmor();
  callbacks[2]('late armor');
  assert.equal(armorIcon.spriteFrame, null);
});

test('armor can be worn and removed from the equipment panel once unlocked, and the choice is saved', () => {
  const { inventory, stats, flush, storage } = runtime();
  flush('data/InventoryDatabase');
  const hint = { string: '', node: {} };
  inventory._armorHint = hint;
  inventory._refreshEquipmentState();
  assert.equal(hint.string, 'Clear a dungeon to unlock');
  assert.equal(inventory.toggleArmor('armor'), false, 'locked armor cannot be worn');
  assert.equal(inventory.toggleArmor('heal_potion'), false, 'only armor goes in the armor slot');

  stats.savedItems.push({ name: 'armor', quantity: 1 });
  inventory.updateWeaponLevelsInDatabase();
  assert.equal(inventory.toggleArmor('armor'), true);
  assert.equal(stats.equippedArmor, 'armor');
  assert.equal(hint.string, 'Worn: +3 DEF');
  assert.equal(JSON.parse(storage.get('SavedPlayerState')).equippedArmor, 'armor');
  stats._invulnerable = 0;
  stats.takeDamage(10);
  assert.equal(stats.hp, 93, 'worn armor absorbs 3 damage');

  inventory.toggleArmor('armor');
  assert.equal(stats.equippedArmor, '');
  assert.equal(hint.string, 'Click to wear: +3 DEF');
  inventory.toggleArmor('armor');
  inventory.unequipArmor();
  assert.equal(stats.equippedArmor, '', 'clicking the armor slot takes the armor off');
  assert.equal(JSON.parse(storage.get('SavedPlayerState')).equippedArmor, '');
});

test('scene-load exceptions release the transition lock and allow retry', () => {
  const { cc, manager, scene } = runtime();
  cc.director.loadScene = () => { throw new Error('Scene unavailable'); };
  assert.equal(manager.changeScene('Overworld'), false);
  assert.equal(manager._transitioning, false);
  cc.director.loadScene = name => { scene.name = name; return true; };
  assert.equal(manager.changeScene('Overworld'), true);
  assert.equal(scene.name, 'Overworld');
});

test('clearing an early dungeon level grants armor and returns to the Overworld', () => {
  const { manager, stats, scene, schedules, storage } = runtime();
  scene.name = 'Dungeon_2';
  manager._dungeonEnemyCount = 1;
  manager.enemyDefeated({ node: { name: 'Goblin' } });
  assert.equal(manager.isPaused, true);
  assert.equal(stats.weaponMastery, 2);
  assert.equal(stats.equippedArmor, 'armor');
  assert.equal(JSON.parse(storage.get('dungeonProgress')).level1Completed, true);
  assert.equal(schedules.length, 1);
  schedules[0]();
  assert.equal(scene.name, 'Overworld');
  const restored = runtime(Object.fromEntries(storage));
  assert.equal(restored.stats.equippedArmor, 'armor');
  restored.flush('data/InventoryDatabase');
  assert.equal(restored.inventory.itemDatabase.armor.locked, false);
  assert.equal(restored.inventory.itemDatabase.axe.locked, false);
  restored.scene.name = 'Dungeon_2';
  restored.manager._dungeonEnemyCount = 1;
  restored.manager.enemyDefeated({ node: { name: 'Goblin' } });
  assert.equal(restored.stats.savedItems.filter(item => item.name === 'armor').length, 1, 'armor is only granted once');
});

test('dungeon-progress write failure does not abort reward processing or victory callback', () => {
  const { cc, manager, stats, scene, schedules } = runtime();
  scene.name = 'Dungeon_2';
  manager._dungeonEnemyCount = 1;
  manager.currentDungeonLevel = 3;
  const write = cc.sys.localStorage.setItem;
  cc.sys.localStorage.setItem = (key, value) => {
    if (key === 'dungeonProgress') throw new Error('Could not write progress');
    write(key, value);
  };
  manager.enemyDefeated({ node: { name: 'GoblinBoss' } });
  assert.equal(manager.isPaused, true);
  assert.equal(stats.money, 350);
  assert.equal(stats.weaponMastery, 3);
  manager.enemyDefeated({ node: { name: 'Goblin' } });
  assert.equal(manager.killcount, 1);
  assert.equal(schedules.length, 1);
  schedules[0]();
  assert.equal(scene.name, 'Game_Win');
});
