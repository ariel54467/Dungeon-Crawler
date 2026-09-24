cc.Class({
  extends: cc.Component,

  onLoad() {
    cc.director.getCollisionManager().enabled = true;
  },

  onCollisionEnter(other) {
    this._save(other.node);
  },

  onBeginContact(contact, self, other) {
    this._save(other.node);
  },

  _save(node) {
    if (node.group !== 'player') return;
    const manager = cc.director.getScene().getComponentInChildren('GameManager');
    const stats = node.getComponent('PlayerStats');
    if (stats) stats.heal(stats.maxHp);
    if (manager && manager.saveAllGameData()) manager.showMessage('Rested and saved');
  },
});
