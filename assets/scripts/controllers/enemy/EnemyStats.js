const HIT_COLOR = cc.color(240, 130, 130);
const TELEGRAPH_COLOR = cc.color(255, 214, 110);
const DAMAGE_TEXT_COLOR = cc.color(255, 240, 150);
const BAR_HEIGHT = 4;

cc.Class({
  extends: cc.Component,
  properties: { maxHp: 50, hp: 50 },

  onLoad() {
    this.anim = this.getComponent(cc.Animation);
    this._dying = false;
    this._telegraph = false;
    this._originalColor = this.node.color.clone();
    if (cc.director.getScene().name === 'Dungeon_2') {
      let level = 1;
      try {
        const saved = Number(cc.sys.localStorage.getItem('currentDungeonLevel'));
        if (isFinite(saved)) level = Math.max(1, Math.min(3, Math.floor(saved)));
      } catch (error) {
        cc.warn('Using default enemy difficulty.', error);
      }
      this.maxHp *= 1 + (level - 1) * 0.5;
    }
    this.hp = this.maxHp;
  },

  start() {
    this.manager = cc.director.getScene().getComponentInChildren('GameManager');
  },

  takeDamage(amount, source) {
    if (this._dying || typeof amount !== 'number' || !isFinite(amount) || amount <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.node.color = HIT_COLOR;
    this.unschedule(this._restoreColor);
    this.scheduleOnce(this._restoreColor, 0.15);
    this._drawHealthBar();
    if (this.manager) this.manager.popText(this.node, String(Math.round(amount)), DAMAGE_TEXT_COLOR);
    if (!this.hp) {
      this._die();
      return;
    }
    const controller = this.getComponent('EnemyController');
    if (controller && cc.isValid(source)) {
      controller.knockback(this.node.convertToWorldSpaceAR(cc.v2()).sub(source.convertToWorldSpaceAR(cc.v2())));
    }
  },

  setTelegraph(active) {
    // Controllers reset combat before this component has captured its original color.
    if (!this._originalColor || this._telegraph === active) return;
    this._telegraph = active;
    this._restoreColor();
  },

  _restoreColor() {
    this.node.color = this._telegraph ? TELEGRAPH_COLOR : this._originalColor;
  },

  _drawHealthBar() {
    if (!this._healthBar) {
      const node = new cc.Node('Health Bar');
      this.node.addChild(node);
      // Undo the enemy's scale so every bar has the same on-screen thickness.
      const scaleX = Math.abs(this.node.scaleX) || 1;
      const scaleY = Math.abs(this.node.scaleY) || 1;
      node.setScale(1 / scaleX, 1 / scaleY);
      node.y = this.node.height * (1 - this.node.anchorY) + 4 / scaleY;
      this._healthBar = node.addComponent(cc.Graphics);
      this._barWidth = Math.min(72, 30 + this.maxHp / 5);
    }
    const ratio = this.hp / this.maxHp;
    const width = this._barWidth;
    const bar = this._healthBar;
    bar.clear();
    bar.fillColor = cc.color(20, 20, 20, 200);
    bar.rect(-width / 2 - 1, -1, width + 2, BAR_HEIGHT + 2);
    bar.fill();
    bar.fillColor = ratio > 0.5 ? cc.color(96, 200, 90) : ratio > 0.25 ? cc.color(232, 180, 60) : cc.color(225, 70, 60);
    bar.rect(-width / 2, 0, width * ratio, BAR_HEIGHT);
    bar.fill();
  },

  _die() {
    if (this._dying) return;
    this._dying = true;
    const controller = this.getComponent('EnemyController');
    if (controller) {
      controller.stopCombat();
      controller.enabled = false;
    }
    const body = this.getComponent(cc.RigidBody);
    if (body) body.linearVelocity = cc.v2();
    this.node.getComponentsInChildren(cc.Collider).forEach(collider => { collider.enabled = false; });
    this.node.getComponentsInChildren(cc.PhysicsCollider).forEach(collider => { collider.enabled = false; });
    this.unscheduleAllCallbacks();
    this._telegraph = false;
    this._restoreColor();
    if (this._healthBar) this._healthBar.node.active = false;
    const manager = cc.director.getScene().getComponentInChildren('GameManager');
    if (manager) manager.enemyDefeated(this);
    const clip = this.anim && this.anim.getClips().find(clip => clip && /_(dead|die)$/.test(clip.name));
    let duration = 0.3;
    if (clip) {
      const state = this.anim.play(clip.name);
      state.wrapMode = cc.WrapMode.Normal;
      duration = state.duration / (state.speed || 1);
    }
    this.scheduleOnce(() => this.node.destroy(), Math.max(0.1, duration));
  },
});
