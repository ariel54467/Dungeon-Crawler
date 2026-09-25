// Draws characters and scenery in top-down order: whatever stands lower on the screen is drawn in front,
// so the player walks behind trees, logs and tunnels and in front of them from the other side.
// Scenery groups on the Canvas named "Group of ..." are moved next to the player so they can interleave.
const SCENERY_GROUP = /^Group of /i;
// Above the map and other unsorted scene nodes, below touch controls (90), inventory, popups and the HUD.
const FIRST_Z = 11;
const LAST_Z = 89;

cc.Class({
  extends: cc.Component,

  start() {
    const canvas = cc.find('Canvas');
    this._entries = [];
    if (!canvas) return;
    canvas.children.filter(group => SCENERY_GROUP.test(group.name) && group.activeInHierarchy).forEach(group => {
      this._sceneryIn(group).forEach(node => this._track(this._reparent(node, canvas), false));
    });
    const player = cc.find('Canvas/Player');
    if (player) this._track(player, true);
    cc.director.getScene().getComponentsInChildren('EnemyController').forEach(enemy => {
      if (enemy.node.parent === canvas && enemy.node.activeInHierarchy) this._track(enemy.node, true);
    });
    this.lateUpdate();
  },

  _sceneryIn(group) {
    const found = [];
    const visit = node => {
      if (!node.active) return;
      if (node.getComponent(cc.Sprite)) found.push(node);
      else node.children.forEach(visit);
    };
    group.children.forEach(visit);
    return found;
  },

  _reparent(node, parent) {
    // Keep the world transform so the sprite and its static collider stay exactly where they were.
    const world = node.convertToWorldSpaceAR(cc.v2());
    let scaleX = 1;
    let scaleY = 1;
    for (let current = node; current && current !== parent; current = current.parent) {
      scaleX *= current.scaleX;
      scaleY *= current.scaleY;
    }
    node.parent = parent;
    node.setPosition(parent.convertToNodeSpaceAR(world));
    node.setScale(scaleX, scaleY);
    return node;
  },

  _track(node, moving) {
    this._entries.push({ node, moving, foot: this._foot(node) });
  },

  _foot(node) {
    // The bottom of the physics body is where the object meets the ground.
    const box = node.getComponent(cc.PhysicsBoxCollider);
    if (box) return node.convertToWorldSpaceAR(cc.v2(box.offset.x, box.offset.y - box.size.height / 2)).y;
    return node.getBoundingBoxToWorld().yMin;
  },

  lateUpdate() {
    if (!this._entries) return;
    this._entries = this._entries.filter(entry => cc.isValid(entry.node));
    this._entries.forEach(entry => {
      if (entry.moving) entry.foot = this._foot(entry.node);
    });
    this._entries.sort((a, b) => b.foot - a.foot);
    this._entries.forEach((entry, index) => {
      const zIndex = Math.min(LAST_Z, FIRST_Z + index);
      if (entry.node.zIndex !== zIndex) entry.node.zIndex = zIndex;
    });
  },
});
