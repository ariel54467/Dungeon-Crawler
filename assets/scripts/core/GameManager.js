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
    try {
      const state = JSON.parse(cc.sys.localStorage.getItem('SavedGameState') || '{}') || {};
      this.playtime = Number(state.playTime) || 0;
      this.killcount = Number(state.killCount) || 0;
      this.deathcount = Number(state.deathCount) || 0;
    } catch (error) {
      cc.warn('Ignoring unreadable game save.', error);
    }
  },

  start() {
    this.playerStats = this.playerNode && this.playerNode.getComponent('PlayerStats');
    this._enemies = cc.director.getScene().getComponentsInChildren('EnemyStats').filter(enemy => enemy.node.activeInHierarchy);
    this._dungeonEnemyCount = this._enemies.length;
    this._defeatedEnemies = new Set();
    this.currentDungeonLevel = Math.max(1, Math.min(3, Number(cc.sys.localStorage.getItem('currentDungeonLevel')) || 1));
    this.inventory = cc.director.getScene().getComponentsInChildren('InventoryManager').find(component => component.node.activeInHierarchy);
    this._popup = cc.find('Canvas/PopUpDungeon');
    this._createHud();
  },

  update(dt) {
    this.isPaused = !!((this._popup && this._popup.activeInHierarchy) || (this.inventory && (
      (this.inventory.generalInventory && this.inventory.generalInventory.activeInHierarchy) ||
      (this.inventory.weaponInventory && this.inventory.weaponInventory.activeInHierarchy)
    )));
    this._updateHud(dt);
    if (this.isPaused) return;
    if (this._transitioning || (this.playerStats && this.playerStats._dead)) return;
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
    const launched = cc.director.loadScene(name, (error, scene) => {
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
    if (this._defeatedEnemies.has(enemy)) return;
    this._defeatedEnemies.add(enemy);
    this.killcount++;
    const stats = this.playerStats;
    if (stats && !stats._dead) {
      stats.money += enemy.node.name === 'GoblinBoss' ? 100 : 25;
      stats.gainExp(enemy.node.name === 'GoblinBoss' ? 50 : 20);
      if (this.inventory && this.inventory.ready && this.killcount % 2 === 0) {
        this.inventory.addItem('heal_potion', 1);
        this.showMessage('Healing potion +1');
      }
    }
    if (cc.director.getScene().name !== 'Dungeon_2' || this._won || !this._dungeonEnemyCount || this._defeatedEnemies.size < this._dungeonEnemyCount || !stats || stats._dead) return;
    this._won = true;
    let progress = {};
    try { progress = JSON.parse(cc.sys.localStorage.getItem('dungeonProgress') || '{}') || {}; } catch (error) { cc.warn('Resetting invalid dungeon progress.'); }
    if (typeof progress !== 'object' || Array.isArray(progress)) progress = {};
    progress['level' + this.currentDungeonLevel + 'Completed'] = true;
    cc.sys.localStorage.setItem('dungeonProgress', JSON.stringify(progress));
    stats.weaponMastery = Math.min(3, Math.max(stats.weaponMastery, this.currentDungeonLevel + 1));
    this.saveAllGameData();
    this.scheduleOnce(() => this.changeScene('Game_Win'), 0.8);
  },

  _createHud() {
    const cameraNode = cc.find('Canvas/Main Camera');
    if (!cameraNode) return;
    this._hudCamera = cameraNode;
    this._hud = new cc.Node('Player HUD');
    cameraNode.parent.addChild(this._hud);
    this._hud.zIndex = 200;
    this._hudGraphics = this._hud.addComponent(cc.Graphics);
    const makeLabel = (name, y, size) => {
      const node = new cc.Node(name);
      this._hud.addChild(node);
      node.setAnchorPoint(0, 1);
      node.setPosition(12, y);
      node.setContentSize(306, 24);
      const label = node.addComponent(cc.Label);
      label.fontSize = size;
      label.lineHeight = size + 4;
      label.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
      label.verticalAlign = cc.Label.VerticalAlign.TOP;
      label.overflow = cc.Label.Overflow.CLAMP;
      node.setContentSize(306, 24);
      return label;
    };
    this._healthLabel = makeLabel('Health', -8, 16);
    this._statsLabel = makeLabel('Stats', -47, 15);
    this._messageLabel = makeLabel('Message', -82, 16);
    this._messageTime = 0;
  },

  showMessage(message) {
    if (this._messageLabel) this._messageLabel.string = message;
    this._messageTime = 3;
  },

  _updateHud(dt) {
    const stats = this.playerStats;
    if (!this._hud || !stats || !stats.ready) return;
    this._hud.active = !this.isPaused;
    const camera = this._hudCamera.getComponent(cc.Camera);
    const zoom = camera ? camera.zoomRatio : 1;
    this._hud.scale = 1 / zoom;
    this._hud.setPosition(this._hudCamera.x + (-cc.winSize.width / 2 + 16) / zoom, this._hudCamera.y + (cc.winSize.height / 2 - 16) / zoom);
    this._healthLabel.string = 'HP ' + Math.ceil(stats.hp) + ' / ' + stats.maxHp + '    LV ' + stats.level;
    this._statsLabel.string = 'Gold ' + stats.money + '    XP ' + stats.exp + ' / 100';
    const gfx = this._hudGraphics;
    gfx.clear();
    gfx.fillColor = cc.color(24, 28, 30, 220);
    gfx.rect(0, -74, 330, 74);
    gfx.fill();
    gfx.fillColor = cc.color(65, 68, 70);
    gfx.rect(12, -39, 306, 8);
    gfx.fill();
    gfx.fillColor = stats.hp / stats.maxHp > 0.3 ? cc.color(88, 194, 130) : cc.color(229, 85, 86);
    gfx.rect(12, -39, 306 * stats.hp / stats.maxHp, 8);
    gfx.fill();
    this._messageTime = Math.max(0, this._messageTime - dt);
    if (this._messageTime === 0) this._messageLabel.string = '';
  },
});
