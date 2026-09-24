cc.Class({
  extends: cc.Component,

  onLoad() {
    let parent = this.node.parent;
    while (parent && !this.controller) {
      this.controller = parent.getComponent('EnemyController');
      parent = parent.parent;
    }
  },

  onEnable() {
    this._hitTargets = new Set();
  },

  onCollisionEnter(other) {
    if (!this.controller || !this.controller.enabled || (this.controller.stats && this.controller.stats._dying) || other.node.group !== 'player') return;
    const target = other.node.getComponent('PlayerStats');
    if (!target || this._hitTargets.has(target)) return;
    this._hitTargets.add(target);
    target.takeDamage(this.controller.damage);
  },
});
