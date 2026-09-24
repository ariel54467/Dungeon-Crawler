cc.Class({
  extends: cc.Component,

  onLoad() {
    cc.director.getCollisionManager().enabled = true;
  },
});
