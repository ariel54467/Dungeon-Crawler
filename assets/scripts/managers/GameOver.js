const Appearance = require('Appearance');

// End-of-run screen: shows the saved run statistics, then returns to the main menu.
const AUTO_CONTINUE_SECONDS = 12;
// Ignore input briefly so keys held during the final moments of play do not skip the screen.
const INPUT_DELAY_SECONDS = 1;

module.exports = cc.Class({
  extends: cc.Component,

  onLoad() {
    const player = cc.find('Canvas/Player');
    const controller = player && player.getComponent('PlayerController');
    if (controller) controller.enabled = false;
    Appearance.apply(player, Appearance.load());
    // Keep the character clear of the title text.
    if (player) player.y = -120;
    this._createSummary();
    this._acceptInput = false;
    this._leaving = false;
    cc.director.preloadScene('Main Menu');
    this.scheduleOnce(() => { this._acceptInput = true; }, INPUT_DELAY_SECONDS);
    this.scheduleOnce(this._continue, AUTO_CONTINUE_SECONDS);
    this.node.on(cc.Node.EventType.TOUCH_END, this._onContinueInput, this);
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this._onContinueInput, this);
  },

  onDestroy() {
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this._onContinueInput, this);
  },

  _onContinueInput() {
    if (this._acceptInput) this._continue();
  },

  _continue() {
    if (this._leaving) return;
    this._leaving = true;
    cc.director.loadScene('Main Menu');
  },

  _readJson(key) {
    try {
      const value = JSON.parse(cc.sys.localStorage.getItem(key) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (error) {
      return {};
    }
  },

  _createSummary() {
    const state = this._readJson('SavedGameState');
    const progress = this._readJson('dungeonProgress');
    const count = value => typeof value === 'number' && isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    const seconds = count(state.playTime);
    const cleared = [1, 2, 3].filter(level => progress['level' + level + 'Completed'] === true).length;
    const name = Appearance.load().name;
    const lines = [
      ...(name ? [name] : []),
      'Kills ' + count(state.killCount) + '      Deaths ' + count(state.deathCount),
      'Play time ' + Math.floor(seconds / 60) + 'm ' + String(seconds % 60).padStart(2, '0') + 's      Dungeon levels ' + cleared + ' / 3',
    ];
    this._addLabel('Run Summary', lines.join('\n'), -200, 20, cc.color(235, 235, 235));
    this._addLabel('Continue Hint', 'Click or press any key to continue', -270, 16, cc.color(160, 160, 160));
  },

  _addLabel(name, text, y, size, color) {
    const node = new cc.Node(name);
    this.node.addChild(node);
    node.setPosition(0, y);
    node.color = color;
    const label = node.addComponent(cc.Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size + 10;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    return label;
  },
});
