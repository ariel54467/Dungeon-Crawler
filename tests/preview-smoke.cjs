const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[2] || 'playwright');
const baseUrl = process.env.COCOS_PREVIEW_URL || 'http://localhost:7456';
const output = path.join(__dirname, '..', 'temp', 'verification');
fs.mkdirSync(output, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    page.setDefaultTimeout(20000);
    const errors = new Set();
    page.on('pageerror', error => errors.add(error.stack));
    page.on('console', message => { if (message.type() === 'error') errors.add(message.text()); });
    await page.goto(baseUrl);
    await page.waitForFunction(() => window.cc && cc.director.getScene());
    await page.evaluate(() => cc.debug.setDisplayStats(false));
    // Editor preview starts the currently open scene, which is not always the menu.
    await page.evaluate(() => {
      if (cc.director.getScene().name !== 'Main Menu') cc.director.loadScene('Main Menu');
    });
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

    await waitScene('Main Menu');
    await page.evaluate(() => cc.director.getScene().getComponentsInChildren('MainMenuManager')[0].onBtnClick());
    // The first game starts with character creation; the chosen look and name carry into play.
    await waitScene('CharacterCustomization');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const screen = cc.director.getScene().getComponentInChildren('CharacterCustomization');
      screen.nameBox.string = 'Tester';
      screen.sliderR.progress = 1;
      screen.sliderG.progress = 0;
      screen.sliderB.progress = 0;
      screen.updateHairColorFromSliders();
      screen.nextSkinTone();
      screen.onConfirm();
    });
    await waitScene('Home');
    await page.waitForFunction(() => cc.find('Canvas/Player HUD/Health'));
    await page.waitForTimeout(100);
    const look = await page.evaluate(() => ({
      hair: cc.find('Canvas/Player/Body/Hair').color.toHEX(),
      skin: cc.find('Canvas/Player/Body').color.toHEX(),
      hud: cc.find('Canvas/Player HUD/Health').getComponent(cc.Label).string,
    }));
    assert.deepEqual([look.hair, look.skin, look.hud.startsWith('Tester')], ['ff0000', 'f2d8c4', true]);
    console.log('PASS character creation carries the name, hair color and skin tone into the game');
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
    // A wall can zero Box2D velocity even while upward input is still held.
    await page.waitForFunction(() => cc.find('Canvas/Player').getComponent('PlayerController').dir.y > 0);
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
          const invisible = [];
          for (const name of ['Body', 'Body/Hair', 'Body/Clothes', 'Weapon']) {
            const sprite = cc.find(name, player).getComponent(cc.Sprite);
            layers[name] = sprite.spriteFrame && sprite.spriteFrame._uuid;
            const texture = sprite.spriteFrame && sprite.spriteFrame.getTexture();
            if (!texture || !texture.loaded) invisible.push(name);
          }
          results.push({ clip: clip.name, layers, invisible });
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
    for (const result of animationResults) {
      for (const [layer, prefix] of Object.entries({ Body: 'player_', 'Body/Hair': 'hair_', 'Body/Clothes': 'boxer_', Weapon: result.clip.split('_')[0] + '_' })) {
        assert.ok((frames.get(result.layers[layer]) || '').startsWith(prefix), result.clip + ' renders incorrect ' + layer);
      }
      assert.deepEqual(result.invisible, [], result.clip + ' has layers without a loaded image');
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
    await page.waitForFunction(() => cc.director.getScene().getComponentsInChildren('InventoryManager').find(component => component.node.activeInHierarchy).ready);
    assert.equal(await page.evaluate(() => cc.director.getScene().getComponentsInChildren('InventoryManager').filter(c => c.node.activeInHierarchy).length), 1);
    const consumables = await page.evaluate(() => {
      const scene = cc.director.getScene(), inv = scene.getComponentsInChildren('InventoryManager').find(component => component.node.activeInHierarchy);
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
      const inv = cc.director.getScene().getComponentsInChildren('InventoryManager').find(component => component.node.activeInHierarchy);
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
    await page.waitForFunction(() => cc.director.getScene().getComponentsInChildren('InventoryManager').find(component => component.node.activeInHierarchy).ready);
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
    // Early levels send the player back to the Overworld, just outside the dungeon sign.
    await waitScene('Overworld');
    const cleared = await page.evaluate(() => {
      const stats = cc.find('Canvas/Player').getComponent('PlayerStats');
      return { progress: JSON.parse(cc.sys.localStorage.getItem('dungeonProgress')), armor: stats.equippedArmor, mastery: stats.weaponMastery, popup: cc.find('Canvas/PopUpDungeon').active };
    });
    assert.equal(cleared.progress.level1Completed, true);
    assert.deepEqual([cleared.armor, cleared.mastery, cleared.popup], ['armor', 2, false]);
    console.log('PASS attack hitbox, one hit per swing, all-enemy completion, rewards, return to the Overworld');

    // The equipment panel's armor row: the reward is shown as worn, and the real buttons take it off and on.
    await page.waitForFunction(() => cc.director.getScene().getComponentsInChildren('InventoryManager').some(component => component.node.activeInHierarchy && component.ready));
    const armor = await page.evaluate(() => {
      const inventory = cc.director.getScene().getComponentsInChildren('InventoryManager').find(component => component.node.activeInHierarchy);
      inventory.toggleWeaponInventory();
      const stats = inventory.playerStats;
      const click = node => node.emit('click', node.getComponent(cc.Button));
      const armorSlot = inventory._equipSlots.find(slot => slot.item.name === 'armor');
      const result = { visible: inventory.armorSlot.activeInHierarchy && inventory.armorGrid.activeInHierarchy, worn: stats.equippedArmor, hint: inventory._armorHint.string, marked: armorSlot.marker.active };
      click(inventory.armorSlot);
      result.afterSlotClick = stats.equippedArmor;
      click(armorSlot.node.getChildByName('ItemButton'));
      result.afterItemClick = stats.equippedArmor;
      inventory.hideInventory();
      return result;
    });
    assert.deepEqual(armor, { visible: true, worn: 'armor', hint: 'Worn: +3 DEF', marked: true, afterSlotClick: '', afterItemClick: 'armor' });
    console.log('PASS armor row: worn reward, take off and put on with the panel buttons');

    await page.evaluate(() => {
      cc.sys.localStorage.setItem('dungeonProgress', JSON.stringify({ level1Completed: true, level2Completed: true }));
      const popup = cc.find('Canvas/PopUpDungeon');
      popup.active = true;
      popup.getComponent('PopUpDungeon').loadDungeonLevel(3);
    });
    await waitScene('Dungeon_2');
    await page.evaluate(() => cc.director.getScene().getComponentsInChildren('EnemyStats').forEach(enemy => enemy.takeDamage(10000)));
    await waitScene('Game_Win');
    await page.waitForTimeout(1100);
    await page.keyboard.press('Enter');
    await waitScene('Main Menu');
    console.log('PASS final level victory screen and continue');
    await page.evaluate(() => cc.director.getScene().getComponentsInChildren('MainMenuManager')[0].onBtnClick());
    await waitScene('Home');
    const deathsBefore = await page.evaluate(() => cc.director.getScene().getComponentInChildren('GameManager').deathcount);
    await page.evaluate(() => { const stats = cc.find('Canvas/Player').getComponent('PlayerStats'); stats._invulnerable = 0; stats.takeDamage(10000); stats.takeDamage(10000); });
    await waitScene('Game_Over');
    assert.equal(await page.evaluate(() => JSON.parse(cc.sys.localStorage.getItem('SavedGameState')).deathCount), deathsBefore + 1);
    const savedHealth = await page.evaluate(() => JSON.parse(cc.sys.localStorage.getItem('SavedPlayerState')));
    assert.equal(savedHealth.hp, savedHealth.maxhp);
    await page.waitForTimeout(1100);
    await page.keyboard.press('Space');
    await waitScene('Main Menu');
    await page.evaluate(() => cc.director.getScene().getComponentsInChildren('MainMenuManager')[0].onBtnClick());
    await waitScene('Home');
    assert.ok((await inspect()).hp > 0);

    // New Game asks for a second click, then starts over from the default save.
    await travel('Overworld');
    await travel('Home');
    await page.evaluate(() => cc.director.loadScene('Main Menu'));
    await waitScene('Main Menu');
    const keptAfterOneClick = await page.evaluate(() => {
      const menu = cc.director.getScene().getComponentsInChildren('MainMenuManager').find(component => component._newGameLabel);
      menu.onNewGameClick();
      const kept = !!cc.sys.localStorage.getItem('SavedPlayerState');
      menu.onNewGameClick();
      return kept;
    });
    assert.equal(keptAfterOneClick, true);
    // A new game creates a new character, starting from a blank name and the default look.
    await waitScene('CharacterCustomization');
    await page.waitForTimeout(300);
    const blank = await page.evaluate(() => {
      const screen = cc.director.getScene().getComponentInChildren('CharacterCustomization');
      const result = { name: screen.nameBox.string, hair: screen.hairSprite.node.color.toHEX() };
      screen.onConfirm();
      return result;
    });
    assert.deepEqual(blank, { name: '', hair: 'ffffff' });
    await waitScene('Home');
    const fresh = await inspect();
    assert.deepEqual([fresh.money, fresh.level, fresh.weapon], [250, 1, 'sword_lvl_1']);
    assert.equal(await page.evaluate(() => cc.sys.localStorage.getItem('dungeonProgress')), null);
    console.log('PASS game over, continue, new game reset');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, 'mobile-home.png') });
    assert.deepEqual(Array.from(errors), [], 'preview runtime errors');
    console.log('PASS death/restart, mobile viewport, no runtime errors');
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
      console.error('Scene at failure:', await page.evaluate(() => {
        const scene = window.cc && cc.director.getScene();
        const player = scene && cc.find('Canvas/Player');
        const controller = player && player.getComponent('PlayerController');
        const body = player && player.getComponent(cc.RigidBody);
        return { scene: scene && scene.name, position: player && { x: player.x, y: player.y }, keys: controller && controller._keys, velocity: body && { x: body.linearVelocity.x, y: body.linearVelocity.y } };
      }).catch(() => null));
    }
    throw error;
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
