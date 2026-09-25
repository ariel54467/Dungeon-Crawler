const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function sorter() {
  let definition;
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets/scripts/core/DepthSort.js'), 'utf8');
  vm.runInNewContext(source, { cc: { Class: value => { definition = value; }, Component: function () {}, isValid: node => !node.destroyed } });
  const instance = { ...definition };
  instance._foot = node => node.foot;
  instance._entries = [];
  return instance;
}

test('scenery and characters are drawn in top-down depth order', () => {
  const depth = sorter();
  const node = (name, foot) => ({ name, foot, zIndex: 0 });
  const tree = node('tree', 100);
  const log = node('log', 120);
  const player = node('player', 150);
  const goblin = node('goblin', 50);
  [tree, log].forEach(scenery => depth._track(scenery, false));
  [player, goblin].forEach(actor => depth._track(actor, true));
  depth.lateUpdate();
  assert.deepEqual([player, log, tree, goblin].map(item => item.zIndex), [11, 12, 13, 14], 'higher on screen is drawn first');

  player.foot = 20;
  depth.lateUpdate();
  assert.ok(player.zIndex > tree.zIndex && player.zIndex > goblin.zIndex, 'walking below the tree brings the player in front');
  player.foot = 110;
  depth.lateUpdate();
  assert.ok(tree.zIndex > player.zIndex && log.zIndex < player.zIndex, 'walking above the trunk puts the player behind it');

  tree.foot = -999;
  depth.lateUpdate();
  assert.ok(tree.zIndex > player.zIndex, 'static scenery is measured once, when tracked');
  goblin.destroyed = true;
  depth.lateUpdate();
  assert.equal(depth._entries.length, 3, 'defeated enemies leave the sort');
});

test('depth order stays below the touch controls, inventory and HUD', () => {
  const depth = sorter();
  const nodes = Array.from({ length: 120 }, (_, i) => ({ foot: -i, zIndex: 0 }));
  nodes.forEach(item => depth._track(item, false));
  depth.lateUpdate();
  assert.equal(Math.max(...nodes.map(item => item.zIndex)), 89);
  assert.equal(Math.min(...nodes.map(item => item.zIndex)), 11);
});
