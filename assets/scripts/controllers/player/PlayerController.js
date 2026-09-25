const Appearance = require('Appearance');

cc.Class({
  extends: cc.Component,

  properties: {
    hitboxUp: { default: null, type: cc.Node },
    hitboxDown: { default: null, type: cc.Node },
    hitboxLeft: { default: null, type: cc.Node },
    hitboxRight: { default: null, type: cc.Node },
    weaponSprite: { default: null, type: cc.Sprite },
    bodySprite: { default: null, type: cc.Sprite },
    attackAudio: { default: null, type: cc.AudioClip },
    hurtAudio: { default: null, type: cc.AudioClip },
  },

  onLoad() {
    this.node.zIndex = 10;
    this.dir = cc.v2();
    this.lastDir = cc.v2(0, -1);
    this._keys = {};
    // Set by TouchControls on touch screens.
    this.touchInput = null;
    this.currentAnim = '';
    this._hurt = false;
    this._attacking = false;
    this._cooldown = 0;
    this.stats = this.getComponent('PlayerStats');
    this.anim = this.getComponent(cc.Animation);
    this.body = this.getComponent(cc.RigidBody);
    // Apply the chosen look first so the hurt flash returns to the player's skin tone.
    Appearance.apply(this.node, Appearance.load());
    this._bodyColor = this.bodySprite ? this.bodySprite.node.color.clone() : cc.Color.WHITE;
    this._disableHitboxes();
    this.node.on('playerDamaged', this._onHurt, this);
    this.node.on('playerStatsLoaded', this._onStatsLoaded, this);
    this.node.on('playerDied', this._onDied, this);
    if (this.anim) this.anim.on('finished', this._onAnimFinished, this);
  },

  onEnable() {
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    cc.game.on(cc.game.EVENT_HIDE, this.resetInput, this);
    if (cc.sys.isBrowser) {
      this._blurHandler = this.resetInput.bind(this);
      window.addEventListener('blur', this._blurHandler);
    }
  },

  start() {
    this.manager = cc.director.getScene().getComponentInChildren('GameManager');
    this._onStatsLoaded();
  },

  onDisable() {
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    cc.game.off(cc.game.EVENT_HIDE, this.resetInput, this);
    if (cc.sys.isBrowser && this._blurHandler) window.removeEventListener('blur', this._blurHandler);
    this.resetInput();
    this._disableHitboxes();
  },

  onDestroy() {
    this.node.off('playerDamaged', this._onHurt, this);
    this.node.off('playerStatsLoaded', this._onStatsLoaded, this);
    this.node.off('playerDied', this._onDied, this);
    if (cc.isValid(this.anim)) this.anim.off('finished', this._onAnimFinished, this);
  },

  _disableHitboxes() {
    [this.hitboxUp, this.hitboxDown, this.hitboxLeft, this.hitboxRight].forEach(node => {
      if (node) node.active = false;
    });
  },

  resetInput() {
    this._keys = {};
    this.dir = cc.v2();
    if (this.body) this.body.linearVelocity = cc.v2();
  },

  onKeyDown(event) {
    this._keys[event.keyCode] = true;
  },

  onKeyUp(event) {
    delete this._keys[event.keyCode];
  },

  _onStatsLoaded() {
    if (!this.stats || !this.anim) return;
    this.anim.getClips().forEach(clip => {
      if (!clip) return;
      const state = this.anim.getAnimationState(clip.name);
      if (state) state.wrapMode = /_(attack|hurt|dead)_/.test(clip.name) ? cc.WrapMode.Normal : cc.WrapMode.Loop;
    });
    this._restoreColor();
    if (!this._attacking && !this._hurt) this.playIdleAnim();
  },

  _restoreColor() {
    if (this.bodySprite) this.bodySprite.node.color = this._bodyColor;
    if (this.weaponSprite && this.stats) this.weaponSprite.node.color = new cc.Color().fromHEX(this.stats.color);
  },

  _directionName(direction) {
    return Math.abs(direction.x) > Math.abs(direction.y)
      ? (direction.x > 0 ? 'right' : 'left')
      : (direction.y > 0 ? 'up' : 'down');
  },

  _equipWeapon(weaponId) {
    if (!this.stats || this.stats._dead || this._attacking) return false;
    return this.stats.onWeaponChanged(weaponId);
  },

  _onHurt() {
    this._hurt = true;
    this._attacking = false;
    this._disableHitboxes();
    this.unschedule(this._finishAttack);
    if (this.body) this.body.linearVelocity = cc.v2();
    if (this.hurtAudio) cc.audioEngine.playEffect(this.hurtAudio, false);
    if (this.bodySprite) this.bodySprite.node.color = cc.color(230, 130, 130);
    if (this.weaponSprite) this.weaponSprite.node.color = cc.color(230, 130, 130);
    const clip = this.stats.animPrefix + '_hurt_' + this._directionName(this.lastDir);
    if (this.anim && this.anim.getAnimationState(clip)) this._playAnimOnce(clip);
    this.unschedule(this._finishHurt);
    this.scheduleOnce(this._finishHurt, 0.2);
  },

  _finishHurt() {
    this._hurt = false;
    this._restoreColor();
    this.currentAnim = '';
  },

  _onDied() {
    this.resetInput();
    this._attacking = false;
    this._disableHitboxes();
    this.unscheduleAllCallbacks();
    this._restoreColor();
    this._playAnimOnce(this.stats.animPrefix + '_dead_' + this._directionName(this.lastDir));
  },

  _tryAttack() {
    if (this.manager && (this.manager.isPaused || this.manager._transitioning)) return;
    if (!this.stats || !this.stats.ready || this.stats._dead || this._hurt || this._attacking || this._cooldown > 0) return;
    const direction = this._directionName(this.lastDir);
    const clip = this.stats.animPrefix + '_attack_' + direction;
    if (!this.anim || !this.anim.getAnimationState(clip)) return;
    this._attacking = true;
    this._cooldown = this.stats.attackCooldown;
    if (this.body) this.body.linearVelocity = cc.v2();
    this._disableHitboxes();
    const chosen = { up: this.hitboxUp, down: this.hitboxDown, left: this.hitboxLeft, right: this.hitboxRight }[direction];
    if (chosen) chosen.active = true;
    if (this.attackAudio) cc.audioEngine.playEffect(this.attackAudio, false);
    this.currentAnim = '';
    const state = this._playAnimOnce(clip);
    // Keep the visible swing and damage window aligned for every weapon.
    state.speed = state.duration / this.stats.attackCooldown;
    this.unschedule(this._disableHitboxes);
    this.scheduleOnce(this._disableHitboxes, Math.min(this.stats.attackDuration, this.stats.attackCooldown));
    this.unschedule(this._finishAttack);
    this.scheduleOnce(this._finishAttack, this.stats.attackCooldown);
  },

  _finishAttack() {
    this._attacking = false;
    this._disableHitboxes();
    this.currentAnim = '';
  },

  update(dt) {
    if (this.manager && (this.manager.isPaused || this.manager._transitioning)) {
      this.resetInput();
      this._disableHitboxes();
      return;
    }
    this._cooldown = Math.max(0, this._cooldown - dt);
    if (!this.stats || !this.stats.ready || this.stats._dead || this._hurt || this._attacking) return;
    const key = cc.macro.KEY;
    const held = code => this._keys[code] ? 1 : 0;
    const touch = this.touchInput;
    this.dir = touch && (touch.x || touch.y) ? cc.v2(touch.x, touch.y) : cc.v2(
      Math.max(held(key.d), held(key.right)) - Math.max(held(key.a), held(key.left)),
      Math.max(held(key.w), held(key.up)) - Math.max(held(key.s), held(key.down))
    );
    const moving = this.dir.magSqr() > 0;
    const velocity = moving ? this.dir.normalize().mul(this.stats.speed) : cc.v2();
    if (moving) this.lastDir = this.dir.normalize();
    if (this.body) this.body.linearVelocity = velocity;
    const tapped = touch && touch.tapped;
    if (touch) touch.tapped = false;
    if (held(key.space) || tapped || (touch && touch.attack)) this._tryAttack();
    if (!this._attacking) {
      if (moving) this.playWalkAnim(velocity);
      else this.playIdleAnim();
    }
  },

  playWalkAnim(velocity) {
    this._playAnimOnce(this.stats.animPrefix + '_walk_' + this._directionName(velocity));
  },

  playIdleAnim() {
    if (this.stats && this.stats.animPrefix) this._playAnimOnce(this.stats.animPrefix + '_idle_' + this._directionName(this.lastDir));
  },

  _playAnimOnce(clip) {
    if (!this.anim || !this.anim.getAnimationState(clip)) return null;
    if (this.weaponSprite && this.bodySprite) {
      this.bodySprite.node.zIndex = 0;
      this.weaponSprite.node.zIndex = clip.endsWith('_up') ? -1 : 1;
    }
    if (this.currentAnim !== clip) {
      this.currentAnim = clip;
      return this.anim.play(clip);
    }
    return this.anim.getAnimationState(clip);
  },

  _onAnimFinished(event, state) {
    if (state && state.name === this.currentAnim && this._attacking) this._finishAttack();
  },
});
