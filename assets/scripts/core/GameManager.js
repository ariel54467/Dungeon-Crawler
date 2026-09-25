const Appearance = require('Appearance');

// Just south of the Overworld dungeon sign, clear of the sign's trigger.
const DUNGEON_EXIT = cc.v2(-47, 1235);
const FINAL_DUNGEON_LEVEL = 3;
const GOLD_COLOR = cc.color(255, 214, 90);
const HURT_COLOR = cc.color(255, 110, 100);
const HEAL_COLOR = cc.color(120, 230, 120);

cc.Class({
  extends: cc.Component,
  properties: { playtime: 0, killcount: 0, deathcount: 0 },

  onLoad() {
    cc.director.getCollisionManager().enabled = true;
    cc.director.getCollisionManager().enabledDebugDraw = false;
    cc.director.getPhysicsManager().enabled = true;
    cc.director.getPhysicsManager().gravity = cc.v2();
    this._timeAccumulator = 0;
    this._transitioning = false;
    this._won = false;
    this.playerNode = cc.find('Canvas/Player');
    this.playtime = this.killcount = this.deathcount = 0;
    try {
      const state = JSON.parse(cc.sys.localStorage.getItem('SavedGameState') || '{}') || {};
      const counter = value => typeof value === 'number' && isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
      this.playtime = counter(state.playTime);
      this.killcount = counter(state.killCount);
      this.deathcount = counter(state.deathCount);
    } catch (error) {
      cc.warn('Ignoring unreadable game save.', error);
    }
  },

  start() {
    this.playerStats = this.playerNode && this.playerNode.getComponent('PlayerStats');
    this._inDungeon = cc.director.getScene().name === 'Dungeon_2';
    this._enemies = cc.director.getScene().getComponentsInChildren('EnemyStats').filter(enemy => enemy.node.activeInHierarchy);
    this._dungeonEnemyCount = this._enemies.length;
    this._defeatedEnemies = new Set();
    this.currentDungeonLevel = 1;
    try {
      const level = Number(cc.sys.localStorage.getItem('currentDungeonLevel'));
      if (isFinite(level)) this.currentDungeonLevel = Math.max(1, Math.min(FINAL_DUNGEON_LEVEL, Math.floor(level)));
    } catch (error) { cc.warn('Using default dungeon level.', error); }
    this.inventory = cc.director.getScene().getComponentsInChildren('InventoryManager').find(component => component.node.activeInHierarchy);
    this._popup = cc.find('Canvas/PopUpDungeon');
    this._villagePopup = cc.find('Canvas/PopUpVillage');
    this._playerName = Appearance.load().name;
    this.refreshPauseState();
    this.node.addComponent('DepthSort');
    this._createHud();
    if (this.playerNode) {
      this.playerNode.on('playerDamaged', this._onPlayerDamaged, this);
      this.playerNode.on('playerHealed', this._onPlayerHealed, this);
      this.playerNode.on('levelUp', this._onLevelUp, this);
    }
  },

  onDestroy() {
    if (cc.isValid(this.playerNode)) this.playerNode.targetOff(this);
  },

  refreshPauseState() {
    this.isPaused = !!(this._won || (this._popup && this._popup.activeInHierarchy) ||
      (this._villagePopup && this._villagePopup.activeInHierarchy) || (this.inventory && (
      (this.inventory.generalInventory && this.inventory.generalInventory.activeInHierarchy) ||
      (this.inventory.weaponInventory && this.inventory.weaponInventory.activeInHierarchy)
    )));
  },

  update(dt) {
    this.refreshPauseState();
    this._updateHud(dt);
    if (this.isPaused) return;
    if (this._transitioning || !this.playerStats || !this.playerStats.ready || this.playerStats._dead) return;
    this._timeAccumulator += dt;
    const seconds = Math.floor(this._timeAccumulator);
    this.playtime += seconds;
    this._timeAccumulator -= seconds;
  },

  saveAllGameData(respawn) {
    const stats = this.playerStats || (this.playerNode && this.playerNode.getComponent('PlayerStats'));
    if (!stats || !stats.ready) return false;
    const inventory = cc.director.getScene().getComponentsInChildren('InventoryManager').find(component => component.node.activeInHierarchy && component.ready);
    if (inventory) inventory.syncPlayerState();
    const playerState = stats.toSaveData();
    if (respawn) playerState.hp = playerState.maxhp;
    try {
      cc.sys.localStorage.setItem('SavedGameState', JSON.stringify({
        playTime: this.playtime, killCount: this.killcount, deathCount: this.deathcount,
      }));
      cc.sys.localStorage.setItem('SavedPlayerState', JSON.stringify(playerState));
      return true;
    } catch (error) {
      cc.warn('Could not save game progress.', error);
      return false;
    }
  },

  changeScene(name, spawn) {
    if (this._transitioning) return false;
    if (!this.saveAllGameData()) return false;
    this._transitioning = true;
    const controller = this.playerNode && this.playerNode.getComponent('PlayerController');
    if (controller) controller.resetInput();
    let launched;
    try {
      launched = cc.director.loadScene(name, (error, scene) => {
        if (error) {
          this._transitioning = false;
          cc.error('Could not load scene ' + name, error);
          return;
        }
        if (spawn) {
          const player = cc.find('Canvas/Player', scene);
          if (player) player.setPosition(spawn.x, spawn.y);
        }
      });
    } catch (error) {
      this._transitioning = false;
      cc.error('Could not load scene ' + name, error);
      return false;
    }
    if (!launched) this._transitioning = false;
    return launched;
  },

  handlePlayerDeath() {
    if (this._transitioning) return;
    this.deathcount++;
    this.saveAllGameData(true);
    this._transitioning = true;
    this.scheduleOnce(() => cc.director.loadScene('Game_Over'), 0.65);
  },

  enemyDefeated(enemy) {
    if (this._transitioning || this._won || this._defeatedEnemies.has(enemy)) return;
    this._defeatedEnemies.add(enemy);
    this.killcount++;
    const stats = this.playerStats;
    if (stats && !stats._dead) {
      const boss = enemy.node.name === 'GoblinBoss';
      const gold = boss ? 100 : 25;
      stats.money += gold;
      this.popText(enemy.node, '+' + gold + ' gold', GOLD_COLOR, 20);
      stats.gainExp(boss ? 50 : 20);
      if (this.killcount % 2 === 0) {
        let added = false;
        if (this.inventory && this.inventory.ready) {
          added = this.inventory.addItem('heal_potion', 1);
        } else {
          // Rewards can arrive before inventory resources finish loading.
          const saved = stats.savedItems.find(item => item.name === 'heal_potion');
          if (saved) saved.quantity++;
          else stats.savedItems.push({ name: 'heal_potion', quantity: 1 });
          added = true;
        }
        if (added) this.showMessage('Healing potion +1');
      }
    }
    if (cc.director.getScene().name !== 'Dungeon_2' || this._won || !this._dungeonEnemyCount || this._defeatedEnemies.size < this._dungeonEnemyCount || !stats || stats._dead) return;
    this._completeDungeon(stats);
  },

  _completeDungeon(stats) {
    this._won = true;
    this.refreshPauseState();
    const level = this.currentDungeonLevel;
    let progress = {};
    try { progress = JSON.parse(cc.sys.localStorage.getItem('dungeonProgress') || '{}') || {}; } catch (error) { cc.warn('Resetting invalid dungeon progress.'); }
    if (typeof progress !== 'object' || Array.isArray(progress)) progress = {};
    progress['level' + level + 'Completed'] = true;
    try { cc.sys.localStorage.setItem('dungeonProgress', JSON.stringify(progress)); }
    catch (error) {
      cc.warn('Could not save dungeon progress.', error);
      this.showMessage('Could not save dungeon progress');
    }
    const unlocked = [];
    const mastery = Math.min(3, Math.max(stats.weaponMastery, level + 1));
    if (mastery > stats.weaponMastery) unlocked.push(mastery === 2 ? 'Axe' : 'Spear');
    stats.weaponMastery = mastery;
    if (!stats.savedItems.some(item => item.name === 'armor')) {
      stats.savedItems.push({ name: 'armor', quantity: 1 });
      stats.equippedArmor = 'armor';
      unlocked.push('Armor (equipped)');
    }
    this.saveAllGameData();
    const final = level >= FINAL_DUNGEON_LEVEL;
    const detail = unlocked.length ? 'Unlocked: ' + unlocked.join(', ') : final ? '' : 'Dungeon level ' + (level + 1) + ' is open';
    this.showBanner(final ? 'DUNGEON CONQUERED' : 'LEVEL ' + level + ' CLEARED', detail);
    // Earlier levels return to the Overworld so the next level can be chosen at the sign.
    if (final) this.scheduleOnce(() => this.changeScene('Game_Win'), 1.6);
    else this.scheduleOnce(() => this.changeScene('Overworld', DUNGEON_EXIT), 2.6);
  },

  _onPlayerDamaged(damage) {
    this.popText(this.playerNode, '-' + damage, HURT_COLOR);
  },

  _onPlayerHealed(amount) {
    this.popText(this.playerNode, '+' + Math.round(amount), HEAL_COLOR);
  },

  _onLevelUp(level) {
    this.showBanner('LEVEL UP!  LV ' + level, 'Max HP, attack and defense increased');
  },

  popText(target, text, color, lift) {
    if (!cc.isValid(target) || !target.parent) return;
    const node = new cc.Node('Floating Text');
    const label = node.addComponent(cc.Label);
    label.string = text;
    label.fontSize = 16;
    label.lineHeight = 18;
    const outline = node.addComponent(cc.LabelOutline);
    outline.color = cc.color(20, 16, 16);
    outline.width = 2;
    node.color = color;
    node.zIndex = 150;
    target.parent.addChild(node);
    // The player node has no size of its own, so fall back to its sprite height.
    const top = Math.max(26, target.height * (1 - target.anchorY) * Math.abs(target.scaleY));
    node.setPosition(target.x + (Math.random() - 0.5) * 12, target.y + top + 6 + (lift || 0));
    cc.tween(node)
      .parallel(
        cc.tween().by(0.8, { y: 30 }, { easing: 'quadOut' }),
        cc.tween().delay(0.45).to(0.35, { opacity: 0 })
      )
      .call(() => node.destroy())
      .start();
  },

  _createHud() {
    const cameraNode = cc.find('Canvas/Main Camera');
    if (!cameraNode) return;
    this._hudCamera = cameraNode;
    this._hud = new cc.Node('Player HUD');
    cameraNode.parent.addChild(this._hud);
    this._hud.zIndex = 200;
    this._hudGraphics = this._hud.addComponent(cc.Graphics);
    const makeLabel = (parent, name, y, size, width) => {
      const node = new cc.Node(name);
      parent.addChild(node);
      node.setAnchorPoint(0, 1);
      node.setPosition(12, y);
      const label = node.addComponent(cc.Label);
      label.fontSize = size;
      label.lineHeight = size + 4;
      label.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
      label.verticalAlign = cc.Label.VerticalAlign.TOP;
      label.overflow = cc.Label.Overflow.SHRINK;
      label.enableWrapText = false;
      node.setContentSize(width, size + 8);
      return label;
    };
    this._healthLabel = makeLabel(this._hud, 'Health', -8, 16, 306);
    this._statsLabel = makeLabel(this._hud, 'Stats', -47, 15, 306);
    this._statusLabel = makeLabel(this._hud, 'Status', -70, 14, 306);
    this._messageLabel = makeLabel(this._hud, 'Message', -93, 15, 306);
    this._messageTime = 0;

    this._banner = new cc.Node('Banner');
    cameraNode.parent.addChild(this._banner);
    this._banner.zIndex = 210;
    this._banner.active = false;
    const bannerLabel = (y, size) => {
      const label = makeLabel(this._banner, 'Banner Text', y, size, 620);
      label.node.setAnchorPoint(0.5, 0.5);
      label.node.x = 0;
      label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
      label.verticalAlign = cc.Label.VerticalAlign.CENTER;
      const outline = label.node.addComponent(cc.LabelOutline);
      outline.color = cc.color(20, 16, 16);
      outline.width = 3;
      return label;
    };
    this._bannerTitle = bannerLabel(24, 38);
    this._bannerTitle.node.color = GOLD_COLOR;
    this._bannerDetail = bannerLabel(-20, 18);
    this._bannerTime = 0;

    if (cc.sys.isMobile || (cc.sys.capabilities && cc.sys.capabilities.touches)) {
      const touchNode = new cc.Node('Touch Controls');
      cameraNode.parent.addChild(touchNode);
      // Below menus and inventory so their buttons still receive taps first.
      touchNode.zIndex = 90;
      touchNode.addComponent('TouchControls');
    }
  },

  showMessage(message) {
    if (this._messageLabel) this._messageLabel.string = message;
    this._messageTime = 3;
  },

  showBanner(title, detail) {
    if (!this._bannerTitle) return;
    this._bannerTitle.string = title;
    this._bannerDetail.string = detail || '';
    this._bannerTime = 2.4;
  },

  _statusText(stats) {
    const parts = [];
    if (this._inDungeon && this._dungeonEnemyCount) {
      parts.push('Dungeon L' + this.currentDungeonLevel + ': ' + (this._dungeonEnemyCount - this._defeatedEnemies.size) + ' left');
    }
    if (stats._defenseTime > 0) parts.push('DEF+5 ' + Math.ceil(stats._defenseTime) + 's');
    // Hit recovery lasts under a second, so only the potion's protection is listed.
    if (stats._invulnerable >= 1) parts.push('Shield ' + Math.ceil(stats._invulnerable) + 's');
    return parts.join('    ');
  },

  _updateHud(dt) {
    const stats = this.playerStats;
    if (!this._hud || !stats || !stats.ready) return;
    this._hud.active = !this.isPaused || this._won;
    const camera = this._hudCamera.getComponent(cc.Camera);
    const zoom = camera ? camera.zoomRatio : 1;
    this._hud.scale = 1 / zoom;
    this._hud.setPosition(this._hudCamera.x + (-cc.winSize.width / 2 + 16) / zoom, this._hudCamera.y + (cc.winSize.height / 2 - 16) / zoom);
    this._healthLabel.string = (this._playerName ? this._playerName + '    ' : '') + 'HP ' + Math.ceil(stats.hp) + ' / ' + stats.maxHp + '    LV ' + stats.level;
    this._statsLabel.string = 'Gold ' + stats.money + '    XP ' + stats.exp + ' / 100';
    const status = this._statusText(stats);
    this._statusLabel.string = status;
    this._messageTime = Math.max(0, this._messageTime - dt);
    if (this._messageTime === 0) this._messageLabel.string = '';
    this._messageLabel.node.y = status ? -93 : -70;
    const height = 74 + (status ? 23 : 0) + (this._messageLabel.string ? 23 : 0);
    const gfx = this._hudGraphics;
    gfx.clear();
    gfx.fillColor = cc.color(24, 28, 30, 220);
    gfx.rect(0, -height, 330, height);
    gfx.fill();
    gfx.fillColor = cc.color(65, 68, 70);
    gfx.rect(12, -39, 306, 8);
    gfx.fill();
    gfx.fillColor = stats.hp / stats.maxHp > 0.3 ? cc.color(88, 194, 130) : cc.color(229, 85, 86);
    gfx.rect(12, -39, 306 * stats.hp / stats.maxHp, 8);
    gfx.fill();

    this._bannerTime = Math.max(0, this._bannerTime - dt);
    this._banner.active = this._bannerTime > 0;
    this._banner.scale = 1 / zoom;
    this._banner.setPosition(this._hudCamera.x, this._hudCamera.y + 90 / zoom);
    this._banner.opacity = 255 * Math.min(1, this._bannerTime / 0.4);
  },
});
