// PatrolDebugTest.js
cc.Class({
  extends: cc.Component,

  properties: {
    // Size of the debug rectangle (centered at spawn position)
    patrolArea: {
      default: () => ({ width: 300, height: 200 }),
      tooltip: "Width/Height of the rectangle drawn around spawn point.",
    },
  },

  onLoad() {
    // 1) Record this node's initial world position:
    this._spawnPoint = this.node.position.clone();

    // 2) Create a cc.Graphics child under the same parent as this.node.
    //    By drawing under node.parent, it won't move when this.node moves.
    const debugName = "PatrolDebug_" + this.node.uuid;
    let debugNode = this.node.parent.getChildByName(debugName);
    if (!debugNode) {
      debugNode = new cc.Node(debugName);
      debugNode.parent = this.node.parent;
      debugNode.setPosition(cc.Vec2.ZERO); // graphics will draw in parent’s local space
      const gfx = debugNode.addComponent(cc.Graphics);
      gfx.lineWidth = 2;
      gfx.strokeColor = cc.Color.RED;
    }
    this._graphics = debugNode.getComponent(cc.Graphics);

    // 3) Verify everything is set up:
    if (!this._graphics) {
      cc.error("PatrolDebugTest: failed to get cc.Graphics on debug node");
    }
    if (
      !this.patrolArea ||
      typeof this.patrolArea.width !== "number" ||
      typeof this.patrolArea.height !== "number"
    ) {
      cc.warn("PatrolDebugTest: patrolArea not valid, using fallback 100×100");
      this.patrolArea = { width: 100, height: 100 };
    }
  },

  update(dt) {
    // 4) Draw the rectangle every frame:
    this._drawRect();
  },

  _drawRect() {
    if (!this._graphics) return;
    this._graphics.clear();

    // Convert the spawn‐point (in world coords) to local coords of debugNode.parent
    // Since debugNode.parent === this.node.parent, we can do:
    const parentSpaceSpawn = this.node.parent.convertToNodeSpaceAR(
      this._spawnPoint
    );

    const halfW = this.patrolArea.width / 2;
    const halfH = this.patrolArea.height / 2;

    // Draw a rect of size (width, height) centered at parentSpaceSpawn:
    this._graphics.rect(
      parentSpaceSpawn.x - halfW,
      parentSpaceSpawn.y - halfH,
      this.patrolArea.width,
      this.patrolArea.height
    );
    this._graphics.stroke();
  },
});
