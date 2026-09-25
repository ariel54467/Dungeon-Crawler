cc.Class({
  extends: cc.Component,

  onLoad() {
    let parent = this.node.parent;
    while (parent && !this.stats) {
      this.stats = parent.getComponent('PlayerStats');
      parent = parent.parent;
    }
  },

  onEnable() {
    this._hitTargets = new Set();
  },

  onCollisionEnter(other) {
    if (!this.stats || !this.stats.ready || this.stats._dead || other.node.group !== 'enemy') return;
    if (this.stats.manager && (this.stats.manager.isPaused || this.stats.manager._transitioning)) return;
    const target = other.node.getComponent('EnemyStats');
    if (!target || this._hitTargets.has(target)) return;
    this._hitTargets.add(target);
    target.takeDamage(this.stats.attack, this.stats.node);
  },
});
