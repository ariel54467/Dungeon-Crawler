cc.Class({
  extends: cc.Component,

  properties: {},

  // LIFE-CYCLE CALLBACKS:

  // onLoad () {},
  onBtnClick() {
    cc.director.loadScene("Home");
    console.log("kek");
  },

  // update (dt) {},
});
