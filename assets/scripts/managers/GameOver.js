cc.Class({
  extends: cc.Component,

  onLoad() {
    const player = cc.find('Canvas/Player');
    const controller = player && player.getComponent('PlayerController');
    if (controller) controller.enabled = false;
    // (Optional) preload the MainMenu scene so the transition is smooth
    cc.director.preloadScene("Main Menu");

    // After 3 seconds, switch back to MainMenu
    this.scheduleOnce(() => {
      cc.director.loadScene("Main Menu");
    }, 3);
  },
});
