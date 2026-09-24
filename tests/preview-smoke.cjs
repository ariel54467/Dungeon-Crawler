const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[2] || 'playwright');
const baseUrl = process.env.COCOS_PREVIEW_URL || 'http://localhost:7456';
const output = path.join(__dirname, '..', 'temp', 'verification');
fs.mkdirSync(output, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    page.setDefaultTimeout(20000);
    const errors = new Set();
    page.on('pageerror', error => errors.add(error.stack));
    page.on('console', message => { if (message.type() === 'error') errors.add(message.text()); });
    await page.goto(baseUrl);
    await page.waitForFunction(() => window.cc && cc.director.getScene());
    await page.evaluate(() => cc.debug.setDisplayStats(false));
    const waitScene = async name => {
      await page.waitForFunction(name => cc.director.getScene().name === name, name);
      if (['Home', 'HomeInside', 'Overworld', 'Dungeon_2'].includes(name)) {
        await page.waitForFunction(() => {
          const player = cc.find('Canvas/Player');
          const stats = player && player.getComponent('PlayerStats');
          return stats && stats.ready;
        });
      }
    };
    const travel = async name => {
      await page.evaluate(name => cc.director.getScene().getComponentInChildren('GameManager').changeScene(name), name);
      await waitScene(name);
    };
    const inspect = () => page.evaluate(() => {
      const scene = cc.director.getScene();
      const stats = cc.find('Canvas/Player').getComponent('PlayerStats');
      return { scene: scene.name, hp: stats.hp, money: stats.money, weapon: stats.weapon, attack: stats.attack, items: stats.savedItems, level: stats.level };
    });

    await page.evaluate(() => cc.director.getScene().getComponentsInChildren('MainMenuManager')[0].onBtnClick());
    await waitScene('Home');
    await page.locator('canvas').click({ position: { x: 400, y: 300 } });
    const initial = await page.evaluate(() => cc.find('Canvas/Player').y);
    await page.keyboard.down('w');
    await page.waitForTimeout(250);
    const moved = await page.evaluate(() => ({ y: cc.find('Canvas/Player').y, clip: cc.find('Canvas/Player').getComponent('PlayerController').currentAnim }));
    assert.ok(moved.y > initial + 5, 'keyboard movement changes the physical position');
    assert.equal(moved.clip, 'sword_walk_up');
    await page.keyboard.down('s');
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => cc.find('Canvas/Player').getComponent(cc.RigidBody).linearVelocity.y), 0);
    await page.keyboard.up('s');
    await page.waitForTimeout(80);
    assert.ok(await page.evaluate(() => cc.find('Canvas/Player').getComponent(cc.RigidBody).linearVelocity.y > 0), 'releasing opposite key keeps held direction');
    await page.keyboard.up('w');
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => cc.find('Canvas/Player').getComponent('PlayerController').currentAnim), 'sword_idle_up');
    await page.keyboard.down('d');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(() => cc.find('Canvas/Player').getComponent(cc.RigidBody).linearVelocity.mag()), 0);
    await page.keyboard.up('d');
    console.log('PASS movement, opposing keys, idle, focus loss');

    const animationResults = await page.evaluate(() => {
      const player = cc.find('Canvas/Player');
      const controller = player.getComponent('PlayerController');
      const animation = player.getComponent(cc.Animation);
      controller.enabled = false;
      const results = [];
      for (const clip of animation.getClips()) {
        if (!clip) continue;
        const paths = clip.curveData.paths;
        const keys = paths.Body.comps['cc.Sprite'].spriteFrame;
        animation.play(clip.name);
        const state = animation.getAnimationState(clip.name);
        for (const key of keys) {
          state.time = key.frame + 0.00001;
          animation.sample(clip.name);
          const layers = {};
          for (const name of ['Body', 'Body/Hair', 'Body/Clothes', 'Weapon']) {
            const sprite = cc.find(name, player).getComponent(cc.Sprite);
            layers[name] = sprite.spriteFrame && sprite.spriteFrame._uuid;
          }
          results.push({ clip: clip.name, layers });
        }
      }
      animation.stop();
      controller.currentAnim = '';
      controller.enabled = true;
      return results;
    });
    const frames = new Map();
    function indexFrames(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) indexFrames(file);
        else if (file.endsWith('.plist.meta')) {
          const meta = JSON.parse(fs.readFileSync(file));
          for (const frame of Object.values(meta.subMetas || {})) frames.set(frame.uuid, path.basename(file));
        }
      }
    }
    indexFrames(path.join(__dirname, '..', 'assets', 'sprites'));
    for (const result of animationResults) for (const [layer, prefix] of Object.entries({ Body: 'player_', 'Body/Hair': 'hair_', 'Body/Clothes': 'boxer_', Weapon: result.clip.split('_')[0] + '_' })) {
      assert.ok((frames.get(result.layers[layer]) || '').startsWith(prefix), result.clip + ' renders incorrect ' + layer);
    }
    console.log('PASS ' + animationResults.length + ' runtime animation frames across all weapons');
    await page.screenshot({ path: path.join(output, 'home.png') });

    await travel('HomeInside');
    await page.evaluate(() => {
      const stats = cc.find('Canvas/Player').getComponent('PlayerStats');
      stats.hp = 40;
      cc.director.getScene().getComponentInChildren('SaveSign')._save(stats.node);
    });
    assert.equal((await inspect()).hp, 100);
    await travel('Overworld');
    await page.waitForFunction(() => cc.director.getScene().getComponentInChildren('InventoryManager').ready);
    assert.equal(await page.evaluate(() => cc.director.getScene().getComponentsInChildren('InventoryManager').filter(c => c.node.activeInHierarchy).length), 1);
    const consumables = await page.evaluate(() => {
      const scene = cc.director.getScene(), inv = scene.getComponentInChildren('InventoryManager');
      const stats = cc.find('Canvas/Player').getComponent('PlayerStats');
      const find = name => inv.items.findIndex(item => item && inv._definition(item).name === name);
      inv.onSlotClick(null, find('heal_potion'));
      const initial = inv.items[find('heal_potion')].quantity;
      inv.onUseButtonClick();
      const atFullHealth = inv.items[find('heal_potion')].quantity;
      stats.hp = 50;
      inv.onUseButtonClick();
      const healed = stats.hp;
      inv.onSlotClick(null, find('def_potion'));
      inv.onUseButtonClick();
      stats._invulnerable = 0;
      stats.takeDamage(10);
      const defended = stats.hp;
      stats.takeDamage(10);
      const repeated = stats.hp;
      inv.onSlotClick(null, find('inv_potion'));
      inv.onUseButtonClick();
      stats.takeDamage(999);
      return { initial, atFullHealth, healed, defended, repeated, invulnerable: stats.hp };
    });
    assert.deepEqual(consumables, { initial: 3, atFullHealth: 3, healed: 80, defended: 75, repeated: 75, invulnerable: 75 });
    console.log('PASS consumables, defense, damage protection, rest/save');

    await page.keyboard.press('e');
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => cc.director.getScene().getComponentInChildren('GameManager').isPaused), true);
    await page.screenshot({ path: path.join(output, 'equipment.png') });
    const upgraded = await page.evaluate(() => {
      const inv = cc.director.getScene().getComponentInChildren('InventoryManager');
      const stats = cc.find('Canvas/Player').getComponent('PlayerStats');
      inv.onUpgradeClick();
      const result = { money: stats.money, attack: stats.attack, weapon: stats.weapon };
      inv.onUpgradeClick();
      result.moneyAfterUnaffordable = stats.money;
      return result;
    });
    assert.deepEqual(upgraded, { money: 150, attack: 10, weapon: 'sword_lvl_2', moneyAfterUnaffordable: 150 });
    await page.keyboard.press('Escape');
    await travel('Home');
    assert.equal((await inspect()).weapon, 'sword_lvl_2');
    assert.equal((await inspect()).money, 150);
    assert.equal((await inspect()).hp, 75);
    await travel('Overworld');
    await page.waitForFunction(() => cc.director.getScene().getComponentInChildren('InventoryManager').ready);
    assert.equal((await inspect()).items.find(item => item.name === 'heal_potion').quantity, 2);
    console.log('PASS upgrades, insufficient gold, equipment and inventory persistence');

    await page.evaluate(() => { const popup = cc.find('Canvas/PopUpDungeon'); popup.active = true; popup.getComponent('PopUpDungeon').loadDungeonLevel(2); });
    assert.equal((await inspect()).scene, 'Overworld', 'locked dungeon rejected');
    await page.screenshot({ path: path.join(output, 'dungeon-menu.png') });
    await page.evaluate(() => cc.find('Canvas/PopUpDungeon').getComponent('PopUpDungeon').loadDungeonLevel(1));
    await waitScene('Dungeon_2');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => cc.director.getScene().getComponentInChildren('GameManager')._dungeonEnemyCount), 3);
    const damage = await page.evaluate(() => {
      const scene = cc.director.getScene();
      const enemy = scene.getComponentsInChildren('EnemyStats')[0];
      const controller = cc.find('Canvas/Player').getComponent('PlayerController');
      controller.lastDir = cc.v2(1, 0);
      controller._tryAttack();
      const hitbox = controller.hitboxRight.getComponent('HitboxDetector');
      const before = enemy.hp;
      hitbox.onCollisionEnter({ node: enemy.node });
      hitbox.onCollisionEnter({ node: enemy.node });
      return { loss: before - enemy.hp, attack: controller.stats.attack, active: [controller.hitboxUp, controller.hitboxDown, controller.hitboxLeft, controller.hitboxRight].filter(n => n.active).length };
    });
    assert.equal(damage.loss, damage.attack);
    assert.equal(damage.active, 1);
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => cc.find('Canvas/Player').getComponent('PlayerController')._attacking), false);
    await page.screenshot({ path: path.join(output, 'dungeon.png') });
    await page.evaluate(() => cc.director.getScene().getComponentsInChildren('EnemyStats').slice(0, 2).forEach(enemy => enemy.takeDamage(10000)));
    await page.waitForTimeout(900);
    assert.equal((await inspect()).scene, 'Dungeon_2', 'two kills must not end a three-enemy dungeon');
    await page.evaluate(() => cc.director.getScene().getComponentsInChildren('EnemyStats').filter(enemy => !enemy._dying).forEach(enemy => enemy.takeDamage(10000)));
    await waitScene('Game_Win');
    assert.equal(await page.evaluate(() => JSON.parse(cc.sys.localStorage.getItem('dungeonProgress')).level1Completed), true);
    console.log('PASS attack hitbox, one hit per swing, all-enemy completion, progression');
    await waitScene('Main Menu');
    await page.evaluate(() => cc.director.getScene().getComponentsInChildren('MainMenuManager')[0].onBtnClick());
    await waitScene('Home');
    const deathsBefore = await page.evaluate(() => cc.director.getScene().getComponentInChildren('GameManager').deathcount);
    await page.evaluate(() => { const stats = cc.find('Canvas/Player').getComponent('PlayerStats'); stats._invulnerable = 0; stats.takeDamage(10000); stats.takeDamage(10000); });
    await waitScene('Game_Over');
    assert.equal(await page.evaluate(() => JSON.parse(cc.sys.localStorage.getItem('SavedGameState')).deathCount), deathsBefore + 1);
    const savedHealth = await page.evaluate(() => JSON.parse(cc.sys.localStorage.getItem('SavedPlayerState')));
    assert.equal(savedHealth.hp, savedHealth.maxhp);
    await waitScene('Main Menu');
    await page.evaluate(() => cc.director.getScene().getComponentsInChildren('MainMenuManager')[0].onBtnClick());
    await waitScene('Home');
    assert.ok((await inspect()).hp > 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, 'mobile-home.png') });
    assert.deepEqual(Array.from(errors), [], 'preview runtime errors');
    console.log('PASS death/restart, mobile viewport, no runtime errors');
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
