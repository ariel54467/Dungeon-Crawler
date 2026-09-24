cc.Class({
  extends: cc.Component,
  properties: { maxHp: 50, hp: 50 },

  onLoad() {
    this.anim = this.getComponent(cc.Animation);
    this._dying = false;
    this._originalColor = this.node.color.clone();
    if (cc.director.getScene().name === 'Dungeon_2') {
      const level = Math.max(1, Math.min(3, Number(cc.sys.localStorage.getItem('currentDungeonLevel')) || 1));
      this.maxHp *= 1 + (level - 1) * 0.5;
    }
    this.hp = this.maxHp;
  },

  takeDamage(amount) {
    if (this._dying || !isFinite(amount) || amount <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.node.color = cc.color(240, 130, 130);
    this.unschedule(this._restoreColor);
    this.scheduleOnce(this._restoreColor, 0.15);
    if (!this.hp) this._die();
  },

  _restoreColor() {
    this.node.color = this._originalColor;
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
    this._restoreColor();
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
