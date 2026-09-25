// Touch input: drag on the left half of the screen to move, tap or hold the right half to attack.
// The node covers the camera view; menu and inventory buttons sit above it and receive taps first.
const STICK_RADIUS = 60;
const KNOB_RADIUS = 26;
const ATTACK_RADIUS = 46;
const DEAD_ZONE = 0.2;
const CORNER_OFFSET = cc.v2(140, 160);

cc.Class({
  extends: cc.Component,

  onLoad() {
    this.input = { x: 0, y: 0, attack: false, tapped: false };
    this._attackTouches = {};
    this._stickTouch = null;
    this._stickOrigin = cc.v2();
    this._graphics = this.node.addComponent(cc.Graphics);
    const labelNode = new cc.Node('Attack Label');
    this.node.addChild(labelNode);
    this._attackLabel = labelNode.addComponent(cc.Label);
    this._attackLabel.string = 'ATK';
    this._attackLabel.fontSize = 18;
    this._attackLabel.lineHeight = 20;
    labelNode.opacity = 200;
    this.node.on(cc.Node.EventType.TOUCH_START, this._onTouchStart, this);
    this.node.on(cc.Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
    this.node.on(cc.Node.EventType.TOUCH_END, this._onTouchEnd, this);
    this.node.on(cc.Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    cc.game.on(cc.game.EVENT_HIDE, this._reset, this);
  },

  start() {
    this.manager = cc.director.getScene().getComponentInChildren('GameManager');
    this.cameraNode = cc.find('Canvas/Main Camera');
    const player = cc.find('Canvas/Player');
    const controller = player && player.getComponent('PlayerController');
    if (controller) controller.touchInput = this.input;
  },

  onDestroy() {
    cc.game.off(cc.game.EVENT_HIDE, this._reset, this);
  },

  _paused() {
    return !!(this.manager && (this.manager.isPaused || this.manager._transitioning));
  },

  _screenPoint(event) {
    // Offset from the screen center in design pixels, which is this node's local space.
    const location = event.getLocation();
    const origin = cc.view.getVisibleOrigin();
    const size = cc.view.getVisibleSize();
    return cc.v2(location.x - origin.x - size.width / 2, location.y - origin.y - size.height / 2);
  },

  _onTouchStart(event) {
    if (this._paused()) return;
    const point = this._screenPoint(event);
    if (point.x < 0 && this._stickTouch === null) {
      this._stickTouch = event.getID();
      this._stickOrigin = point;
      this._setStick(point);
      return;
    }
    this._attackTouches[event.getID()] = true;
    this.input.attack = true;
    this.input.tapped = true;
  },

  _onTouchMove(event) {
    if (event.getID() === this._stickTouch) this._setStick(this._screenPoint(event));
  },

  _onTouchEnd(event) {
    const id = event.getID();
    if (id === this._stickTouch) {
      this._stickTouch = null;
      this.input.x = this.input.y = 0;
    }
    delete this._attackTouches[id];
    this.input.attack = Object.keys(this._attackTouches).length > 0;
  },

  _setStick(point) {
    const offset = point.sub(this._stickOrigin);
    const length = offset.mag();
    if (length < STICK_RADIUS * DEAD_ZONE) {
      this.input.x = this.input.y = 0;
      return;
    }
    const scale = 1 / Math.max(length, STICK_RADIUS);
    this.input.x = offset.x * scale;
    this.input.y = offset.y * scale;
  },

  _reset() {
    this._stickTouch = null;
    this._attackTouches = {};
    this.input.x = this.input.y = 0;
    this.input.attack = this.input.tapped = false;
  },

  update() {
    if (!cc.isValid(this.cameraNode)) return;
    const camera = this.cameraNode.getComponent(cc.Camera);
    const zoom = camera && camera.zoomRatio > 0 ? camera.zoomRatio : 1;
    const size = cc.view.getVisibleSize();
    this.node.setContentSize(size);
    this.node.setPosition(this.cameraNode.position);
    this.node.scale = 1 / zoom;
    const gfx = this._graphics;
    gfx.clear();
    const hidden = this._paused();
    this._attackLabel.node.active = !hidden;
    if (hidden) {
      this._reset();
      return;
    }
    const steering = this._stickTouch !== null;
    const base = steering ? this._stickOrigin : cc.v2(-size.width / 2 + CORNER_OFFSET.x, -size.height / 2 + CORNER_OFFSET.y);
    const knob = base.add(cc.v2(this.input.x, this.input.y).mul(STICK_RADIUS));
    gfx.lineWidth = 2;
    gfx.fillColor = cc.color(255, 255, 255, steering ? 50 : 26);
    gfx.strokeColor = cc.color(255, 255, 255, steering ? 120 : 70);
    gfx.circle(base.x, base.y, STICK_RADIUS);
    gfx.fill();
    gfx.stroke();
    gfx.fillColor = cc.color(255, 255, 255, steering ? 150 : 70);
    gfx.circle(knob.x, knob.y, KNOB_RADIUS);
    gfx.fill();
    const attack = cc.v2(size.width / 2 - CORNER_OFFSET.x, -size.height / 2 + CORNER_OFFSET.y);
    gfx.fillColor = cc.color(230, 90, 70, this.input.attack ? 170 : 90);
    gfx.strokeColor = cc.color(255, 220, 200, 140);
    gfx.circle(attack.x, attack.y, ATTACK_RADIUS);
    gfx.fill();
    gfx.stroke();
    this._attackLabel.node.setPosition(attack);
  },
});
