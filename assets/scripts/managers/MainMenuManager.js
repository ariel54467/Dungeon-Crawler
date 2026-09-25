const Appearance = require('Appearance');

const SAVE_KEYS = ['SavedGameState', 'SavedPlayerState', 'dungeonProgress', 'currentDungeonLevel', Appearance.STORAGE_KEY];
const CONFIRM_SECONDS = 3;

cc.Class({
  extends: cc.Component,

  properties: {},

  onLoad() {
    // The title and the start button share this component; only the button adds the menu extras.
    if (!this.getComponent(cc.Button)) return;
    const touch = cc.sys.isMobile || (cc.sys.capabilities && cc.sys.capabilities.touches);
    this._addLabel('Controls Hint', touch
      ? 'Drag the left side to move, tap the right side to attack'
      : 'Move: WASD / Arrows    Attack: Space    Items: I    Equipment: E    Start: Enter', -292, 16, 900);
    if (this._hasSave()) {
      this._newGameLabel = this._addLabel('New Game', 'NEW GAME', -246, 22, 380);
      this._newGameLabel.node.on(cc.Node.EventType.TOUCH_END, this.onNewGameClick, this);
    }
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this._onKeyUp, this);
  },

  onDestroy() {
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this._onKeyUp, this);
  },

  _onKeyUp(event) {
    if (event.keyCode === cc.macro.KEY.enter) this.onBtnClick();
  },

  _hasSave() {
    try {
      return SAVE_KEYS.some(key => cc.sys.localStorage.getItem(key));
    } catch (error) {
      return false;
    }
  },

  _addLabel(name, text, y, size, width) {
    const node = new cc.Node(name);
    this.node.parent.addChild(node);
    node.setPosition(0, y);
    const label = node.addComponent(cc.Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size + 6;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    label.overflow = cc.Label.Overflow.SHRINK;
    label.enableWrapText = false;
    node.setContentSize(Math.min(width, cc.winSize.width - 32), size + 12);
    const outline = node.addComponent(cc.LabelOutline);
    outline.color = cc.color(60, 32, 16);
    outline.width = 2;
    return label;
  },

  onNewGameClick() {
    if (this._loading) return;
    if (!this._confirmingReset) {
      this._confirmingReset = true;
      this._newGameLabel.string = 'CLICK AGAIN TO ERASE YOUR SAVE';
      this.scheduleOnce(this._cancelReset, CONFIRM_SECONDS);
      return;
    }
    this.unschedule(this._cancelReset);
    try {
      SAVE_KEYS.forEach(key => cc.sys.localStorage.removeItem(key));
    } catch (error) {
      cc.warn('Could not erase the saved game.', error);
    }
    this._startScene('CharacterCustomization');
  },

  _cancelReset() {
    this._confirmingReset = false;
    if (this._newGameLabel) this._newGameLabel.string = 'NEW GAME';
  },

  onBtnClick() {
    // A first game starts by creating the character; later games continue from the save.
    this._startScene(this._hasSave() ? 'Home' : 'CharacterCustomization');
  },

  _startScene(name) {
    if (this._loading) return;
    this._loading = true;
    try {
      const launched = cc.director.loadScene(name, error => {
        if (error) {
          this._loading = false;
          cc.error('Could not start the game.', error);
        }
      });
      if (!launched) this._loading = false;
    } catch (error) {
      this._loading = false;
      cc.error('Could not start the game.', error);
    }
  },
});
