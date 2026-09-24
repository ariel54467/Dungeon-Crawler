cc.Class({
  extends: cc.Component,
  properties: { playerNode: cc.Node },

  onBeginContact(contact, self, other) {
    this._enter(other.node);
  },

  _enter(other) {
    if (other.group !== 'player') return;
    const routes = {
      HomeSign: { scene: 'Home', spawn: cc.v2(-410, -237) },
      VillageSign: { scene: 'Overworld' },
      HomeInSign: { scene: 'HomeInside' },
      HomeEnterSign: { scene: 'Home', spawn: cc.v2(460, -237) },
      HomeOutSign: { scene: 'Home', spawn: cc.v2(-50, 400) },
      OverWorldSign: { scene: 'Overworld' },
    };
    const route = routes[this.node.name];
    const manager = cc.director.getScene().getComponentInChildren('GameManager');
    if (route && manager) manager.changeScene(route.scene, route.spawn);
  },
});
