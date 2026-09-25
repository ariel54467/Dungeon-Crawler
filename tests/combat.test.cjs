const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { gameRequire } = require('./game-require.cjs');

const root = path.join(__dirname, '..');
const weaponData = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/data/weapons.json')));
const vector = (x = 0, y = 0) => ({ x, y });

function component(file, options = {}) {
  let definition;
  const manager = options.manager || { isPaused: false, _transitioning: false };
  const scene = { name: options.scene || 'Home', getComponentInChildren: () => manager };
  const cc = {
    Class: value => { definition = value; },
    Component: function () {}, Node: function () {}, Sprite: function () {},
    AudioClip: function () {}, JsonAsset: function () {}, Animation: function () {},
    RigidBody: function () {},
    isValid: object => !!object && object.valid !== false,
    v2: vector, color: (...values) => values,
    warn() {}, error() {},
    director: { getScene: () => scene },
    sys: { localStorage: { getItem: () => options.storageValue || null } },
    resources: { load: (name, type, callback) => callback(null, { json: name === 'data/weapons' ? weaponData : {} }) },
    ...options.cc,
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/scripts/controllers', file), 'utf8'), { cc, Set, require: gameRequire(cc) });
  const instance = { ...definition, enabled: true, manager };
  for (const [name, value] of Object.entries(definition.properties || {})) {
    instance[name] = value && typeof value === 'object' && 'default' in value ? value.default : value;
  }
  instance.events = [];
  instance.node = { emit: (...event) => instance.events.push(event), color: { clone: () => ({}) } };
  instance.getComponent = () => null;
  instance.scheduleOnce = () => {};
  instance.unschedule = () => {};
  return instance;
}

function player(options) {
  const stats = component('player/PlayerStats.js', options);
  stats.ready = true;
  stats._dead = false;
  stats._invulnerable = 0;
  stats._defenseTime = 0;
  stats.equippedArmor = '';
  return stats;
}

test('inventory pause preserves potion durations and prevents damage until play resumes', () => {
  const stats = player();
  stats.useConsumable('inv_potion');
  stats.useConsumable('def_potion');
  stats.manager.isPaused = true;
  stats.update(20);
  assert.equal(stats._invulnerable, 5);
  assert.equal(stats._defenseTime, 15);
  stats._invulnerable = 0;
  assert.equal(stats.takeDamage(20), false);
  assert.equal(stats.hp, 100);
  stats.manager.isPaused = false;
  stats.update(1);
  assert.equal(stats._defenseTime, 14);
  assert.equal(stats.takeDamage(20), true);
  assert.equal(stats.hp, 85);
  assert.equal(stats.takeDamage(20), false, 'one hit starts damage protection');
});

test('scene transitions freeze timed effects and reject new attacks and damage', () => {
  const manager = { isPaused: false, _transitioning: true };
  const stats = player({ manager });
  stats._defenseTime = 10;
  stats.update(1);
  assert.equal(stats._defenseTime, 10);
  assert.equal(stats.takeDamage(20), false);
  for (const file of ['player/PlayerController.js', 'enemy/EnemyController.js']) {
    const controller = component(file, { manager });
    controller.stats = stats;
    controller._tryAttack(vector(1, 0));
    assert.notEqual(controller._attacking, true, file);
  }
});

test('invalid health and XP inputs cannot corrupt stats or enter an infinite level-up loop', () => {
  const stats = player();
  stats.hp = 90;
  for (const amount of [undefined, NaN, Infinity, -Infinity, '25', 0, -1]) {
    assert.equal(stats.heal(amount), false);
    assert.equal(stats.takeDamage(amount), false);
    stats.gainExp(amount);
    assert.equal(stats.hp, 90);
    assert.equal(stats.exp, 0);
  }
  assert.equal(stats.heal(30), true);
  assert.equal(stats.hp, 100);
  assert.deepEqual(stats.events.pop(), ['playerHealed', 10]);
  stats.gainExp(250);
  assert.equal(stats.level, 3);
  assert.equal(stats.exp, 50);
  assert.equal(stats.lvlPoint, 2);
  assert.equal(stats.maxHp, 140);
  assert.equal(stats.hp, 140);
  stats.exp = 1e20;
  stats.gainExp(20);
  assert.ok(stats.exp >= 0 && stats.exp < 100);
  assert.ok(isFinite(stats.level));
});

test('lethal damage emits death and increments the manager only once', () => {
  let deaths = 0;
  const stats = player({ manager: { handlePlayerDeath: () => deaths++ } });
  assert.equal(stats.takeDamage(1000), true);
  assert.equal(stats.takeDamage(1000), false);
  assert.equal(stats._dead, true);
  assert.equal(stats.hp, 0);
  assert.equal(deaths, 1);
  assert.equal(stats.events.filter(event => event[0] === 'playerDied').length, 1);
});

test('loading a damaged save recovers a living player with valid weapon tiers and items', () => {
  const stats = player();
  stats._loadState({
    hp: 0, level: 2.7, speedskill: 1.8, weaponmastery: 2.5,
    upgradeweapon: 4.9, weapon: 'axe_lvl_1', equippedArmor: 'armor',
    items: [
      { name: 'heal_potion', quantity: 2.8 },
      { name: 'armor', quantity: 0.5 },
      { name: 'inv_potion', quantity: Infinity },
      { name: 'def_potion', quantity: '2' },
    ],
  });
  assert.equal(stats.hp, stats.maxHp);
  assert.equal(stats.level, 2);
  assert.equal(stats.weaponMastery, 2);
  assert.equal(stats.upgradeLevel, 4);
  assert.equal(stats.weapon, 'axe_lvl_1');
  assert.equal(stats.attack, 12);
  assert.equal(stats.equippedArmor, '');
  assert.equal(JSON.stringify(stats.savedItems), JSON.stringify([{ name: 'heal_potion', quantity: 2 }]));
  assert.equal(stats.ready, true);
  stats._loadState(null);
  assert.equal(stats.weapon, 'sword_lvl_1');
  assert.equal(stats.hp, 100);
});

test('armor and potions soften hits but never make the player immune', () => {
  const stats = player();
  stats.defense = 4;
  stats.equippedArmor = 'armor';
  stats._defenseTime = 10;
  assert.equal(stats.takeDamage(5), true);
  assert.equal(stats.hp, 99);
  stats._invulnerable = 0;
  stats.defense = 0;
  stats.equippedArmor = '';
  stats._defenseTime = 0;
  assert.equal(stats.takeDamage(12.5), true);
  assert.equal(stats.hp, 86, 'scaled enemy damage keeps health whole');
});

test('enemies hold a telegraphed wind-up and only deal damage on the swing', () => {
  const controller = component('enemy/EnemyController.js');
  const telegraph = [];
  controller.body = { linearVelocity: vector(5, 5) };
  controller.stats = { setTelegraph: active => telegraph.push(active) };
  for (const side of ['Up', 'Down', 'Left', 'Right']) controller['hitbox' + side] = { active: false };
  Object.assign(controller, { attackWindup: 0.4, attackDuration: 0.1, attackCooldown: 2 });
  controller._tryAttack(vector(1, 0));
  assert.equal(controller._attacking, true);
  assert.deepEqual(controller.body.linearVelocity, vector());
  assert.deepEqual(telegraph, [true]);
  const at = time => { controller._attackTime = time; controller._updateAttack(); };
  at(0.39);
  assert.equal(controller.hitboxRight.active, false, 'no damage during the wind-up');
  at(0.4);
  assert.equal(controller.hitboxRight.active, true);
  assert.deepEqual(telegraph, [true, false]);
  assert.equal(controller.hitboxLeft.active || controller.hitboxUp.active || controller.hitboxDown.active, false);
  at(0.5);
  assert.equal(controller.hitboxRight.active, false);
  assert.equal(controller._attacking, true, 'follow-through is still part of the attack');
  at(0.75);
  assert.equal(controller._attacking, false, 'free to chase for the rest of the cooldown');
  assert.equal(controller._cooldown, 2);
});

test('hits push enemies back without interrupting a committed swing', () => {
  const controller = component('enemy/EnemyController.js');
  const away = { magSqr: () => 25, normalize: () => ({ mul: speed => vector(0.6 * speed, 0.8 * speed) }) };
  controller.body = { linearVelocity: vector() };
  controller.knockback(away);
  assert.deepEqual(controller.body.linearVelocity, vector(132, 176));
  assert.ok(controller._knockbackTime > 0);
  for (const state of [{ _attacking: true }, { _attacking: false, knockbackSpeed: 0 }]) {
    const other = component('enemy/EnemyController.js');
    other.body = { linearVelocity: vector() };
    Object.assign(other, state);
    other.knockback(away);
    assert.deepEqual(other.body.linearVelocity, vector());
  }
});

test('enemies stop movement and hitboxes when their target disappears or a scene transition starts', () => {
  for (const missingPlayer of [true, false]) {
    const controller = component('enemy/EnemyController.js');
    controller.body = { linearVelocity: vector(50, 20) };
    controller.hitboxRight = { active: true };
    controller._attacking = true;
    controller.playerNode = missingPlayer ? null : { getComponent: () => ({ ready: true }) };
    controller.manager._transitioning = !missingPlayer;
    controller.update(0.016);
    assert.deepEqual(controller.body.linearVelocity, vector());
    assert.equal(controller.hitboxRight.active, false);
    assert.equal(controller._attacking, false);
  }
});

test('player and enemy hitboxes apply damage once per swing and ignore menu collisions', () => {
  for (const enemyAttacker of [false, true]) {
    let hits = 0;
    const detector = component(enemyAttacker ? 'enemy/EnemyHitboxDetector.js' : 'player/HitboxDetector.js');
    const attacker = { ready: true, enabled: true, attack: 5, damage: 10, manager: detector.manager };
    if (enemyAttacker) detector.controller = attacker;
    else detector.stats = attacker;
    const target = { takeDamage: () => hits++ };
    const collider = { node: { group: enemyAttacker ? 'player' : 'enemy', getComponent: () => target } };
    detector.onEnable();
    detector.manager.isPaused = true;
    detector.onCollisionEnter(collider);
    assert.equal(hits, 0);
    detector.manager.isPaused = false;
    detector.onCollisionEnter(collider);
    detector.onCollisionEnter(collider);
    assert.equal(hits, 1);
    detector.onEnable();
    detector.onCollisionEnter(collider);
    assert.equal(hits, 2);
  }
});

test('enemy difficulty uses whole supported levels and tolerates unavailable save storage', () => {
  for (const [value, multiplier] of [['2.9', 1.5], ['Infinity', 1], ['3', 2], ['-4', 1]]) {
    const stats = component('enemy/EnemyStats.js', { scene: 'Dungeon_2', storageValue: value });
    stats.onLoad();
    assert.equal(stats.hp, 50 * multiplier);
  }
  const stats = component('enemy/EnemyStats.js', {
    scene: 'Dungeon_2',
    cc: { sys: { localStorage: { getItem() { throw new Error('Storage unavailable'); } } } },
  });
  assert.doesNotThrow(() => stats.onLoad());
  assert.equal(stats.hp, 50);
});
