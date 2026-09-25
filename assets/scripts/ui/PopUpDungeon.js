cc.Class({
  extends: cc.Component,
  properties: {
    level1Button: { default: null, type: cc.Button },
    level2Button: { default: null, type: cc.Button },
    level3Button: { default: null, type: cc.Button },
    closeButton: { default: null, type: cc.Button },
    lockedSprite: { default: null, type: cc.SpriteFrame },
    unlockedSprite: { default: null, type: cc.SpriteFrame },
  },

  onLoad() {
    this.node.zIndex = 150;
    this._panelScale = this.node.scale;
    this._levelHandlers = [];
    [this.level1Button, this.level2Button, this.level3Button].forEach((button, i) => {
      const handler = () => this.loadDungeonLevel(i + 1);
      this._levelHandlers.push(handler);
      if (button) button.node.on('click', handler, this);
    });
    if (this.closeButton) this.closeButton.node.on('click', this.onCloseClick, this);
    this.node.active = false;
  },

  onEnable() {
    this.loadProgress();
    this.initButtons();
    this.lateUpdate();
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
    this._refreshPauseState();
  },

  onDisable() {
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
    this._refreshPauseState();
  },

  onDestroy() {
    [this.level1Button, this.level2Button, this.level3Button].forEach((button, i) => {
      if (button && cc.isValid(button.node)) button.node.off('click', this._levelHandlers[i], this);
    });
    if (this.closeButton && cc.isValid(this.closeButton.node)) this.closeButton.node.off('click', this.onCloseClick, this);
  },

  onKeyDown(event) {
    if (event.keyCode === cc.macro.KEY.escape) this.onCloseClick();
  },

  _refreshPauseState() {
    const scene = cc.director.getScene();
    const manager = scene && scene.getComponentInChildren('GameManager');
    if (manager) manager.refreshPauseState();
  },

  lateUpdate() {
    const cameraNode = cc.find('Canvas/Main Camera');
    if (!cameraNode) return;
    this.node.setPosition(cameraNode.getPosition());
    const camera = cameraNode.getComponent(cc.Camera);
    const zoom = camera && camera.zoomRatio > 0 ? camera.zoomRatio : 1;
    const fit = Math.min(1, cc.winSize.width / 520, cc.winSize.height / 520);
    this.node.scale = this._panelScale * fit / zoom;
  },

  loadProgress() {
    let saved = {};
    try { saved = JSON.parse(cc.sys.localStorage.getItem('dungeonProgress') || '{}') || {}; } catch (error) { cc.warn('Ignoring invalid dungeon progress.'); }
    this.dungeonProgress = {
      level1Completed: saved.level1Completed === true,
      level2Completed: saved.level2Completed === true,
      level3Completed: saved.level3Completed === true,
    };
  },

  initButtons() {
    [this.level1Button, this.level2Button, this.level3Button].forEach((button, i) => {
      if (!button) return;
      const unlocked = i === 0 || this.dungeonProgress['level' + i + 'Completed'];
      button.interactable = unlocked;
      const sprite = button.node.getComponent(cc.Sprite);
      const frame = unlocked ? this.unlockedSprite : this.lockedSprite;
      if (sprite && frame) sprite.spriteFrame = frame;
    });
  },

  onLevel1Click() { this.loadDungeonLevel(1); },
  onLevel2Click() { this.loadDungeonLevel(2); },
  onLevel3Click() { this.loadDungeonLevel(3); },
  onCloseClick() { this.node.active = false; },

  loadDungeonLevel(level) {
    if (!Number.isInteger(level) || level < 1 || level > 3) return false;
    this.loadProgress();
    if (level > 1 && !this.dungeonProgress['level' + (level - 1) + 'Completed']) return false;
    const manager = cc.director.getScene().getComponentInChildren('GameManager');
    if (!manager || manager._transitioning) return false;
    try {
      cc.sys.localStorage.setItem('currentDungeonLevel', String(level));
    } catch (error) {
      cc.warn('Could not save selected dungeon.', error);
      manager.showMessage('Unable to save. Check browser storage and try again.');
      return false;
    }
    return manager.changeScene('Dungeon_2');
  },

  completeLevel(level) {
    if (!Number.isInteger(level) || level < 1 || level > 3) return false;
    this.loadProgress();
    const progress = Object.assign({}, this.dungeonProgress, { ['level' + level + 'Completed']: true });
    try {
      cc.sys.localStorage.setItem('dungeonProgress', JSON.stringify(progress));
    } catch (error) {
      cc.warn('Could not save dungeon progress.', error);
      return false;
    }
    this.dungeonProgress = progress;
    this.initButtons();
    return true;
  },
});
