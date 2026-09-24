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
    [this.level1Button, this.level2Button, this.level3Button].forEach((button, i) => {
      if (button) button.node.on('click', () => this.loadDungeonLevel(i + 1), this);
    });
    if (this.closeButton) this.closeButton.node.on('click', this.onCloseClick, this);
    this.node.active = false;
  },

  onEnable() {
    const camera = cc.find('Canvas/Main Camera');
    if (camera) this.node.setPosition(camera.getPosition());
    this.loadProgress();
    this.initButtons();
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
    if (level < 1 || level > 3 || (level > 1 && !this.dungeonProgress['level' + (level - 1) + 'Completed'])) return;
    const manager = cc.director.getScene().getComponentInChildren('GameManager');
    if (!manager) return;
    cc.sys.localStorage.setItem('currentDungeonLevel', String(level));
    manager.changeScene('Dungeon_2');
  },

  completeLevel(level) {
    if (level < 1 || level > 3) return;
    this.dungeonProgress['level' + level + 'Completed'] = true;
    cc.sys.localStorage.setItem('dungeonProgress', JSON.stringify(this.dungeonProgress));
    this.initButtons();
  },
});
