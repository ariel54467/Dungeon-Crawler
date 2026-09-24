cc.Class({
  extends: cc.Component,

  onBeginContact(contact, self, other) {
    this._setPopup(other.node.name, true);
  },

  onEndContact(contact, self, other) {
    this._setPopup(other.node.name, false);
  },

  onCollisionEnter(other) {
    this._setPopup(other.node.name, true);
  },

  onCollisionExit(other) {
    this._setPopup(other.node.name, false);
  },

  _setPopup(name, active) {
    const popups = { VillageSign: 'PopUpVillage', DungeonSign: 'PopUpDungeon', BlackSmith: 'BlackSmithPopup', SaveSign: 'SavePopup' };
    if (!popups[name]) return;
    const popup = cc.find('Canvas/' + popups[name]);
    if (popup) popup.active = active;
  },
});
