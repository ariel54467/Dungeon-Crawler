cc.Class({
  extends: cc.Component,

  properties: {
    target: {
      default: null,
      type: cc.Node,
      tooltip: "The player node to follow",
    },
    followInventory: {
      default: null,
      type: cc.Node,
    },
    followUI: {
      default: null,
      type: cc.Node,
    },
    followSpeed: {
      default: 5,
      tooltip: "Smoothness of camera follow",
    },
    offset: {
      default: cc.v2(0, 0),
      tooltip: "Offset from player",
    },
    boundaryNode: {
      default: null,
      type: cc.Node,
      tooltip: "Node with the ChainCollider2D that defines the camera bounds",
    },
  },

  onLoad() {
    this._calculateBounds();
    if (this.followInventory) this.followInventory.zIndex = 100;
    if (this.followUI) this.followUI.zIndex = 100;
  },

  _calculateBounds() {
    if (!this.boundaryNode) {
      cc.warn("No boundary node assigned!");
      return;
    }

    const chainCollider = this.boundaryNode.getComponent(
      cc.PhysicsChainCollider
    );
    if (!chainCollider || chainCollider.points.length === 0) {
      cc.warn("Boundary node must have a PhysicsChainCollider!");
      return;
    }

    const worldPoints = chainCollider.points.map((p) => {
      return this.boundaryNode.convertToWorldSpaceAR(cc.v2(p));
    });

    let minX = worldPoints[0].x,
      maxX = worldPoints[0].x;
    let minY = worldPoints[0].y,
      maxY = worldPoints[0].y;

    for (let i = 1; i < worldPoints.length; i++) {
      let p = worldPoints[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    // Convert world bounds to local space
    let parent = this.node.parent;
    let bottomLeft = parent.convertToNodeSpaceAR(cc.v2(minX, minY));
    let topRight = parent.convertToNodeSpaceAR(cc.v2(maxX, maxY));

    this.bounds = {
      left: bottomLeft.x,
      right: topRight.x,
      bottom: bottomLeft.y,
      top: topRight.y,
    };
  },

  start() {
    // Open on the player instead of sweeping across the map from the scene origin.
    if (this.target && this.bounds) this._moveTo(this._clamp(this._targetPosition()));
  },

  update(dt) {
    if (!this.target || !this.bounds) return;
    // Smooth follow
    const newPos = this.node.position.lerp(this._targetPosition(), Math.min(1, this.followSpeed * dt));
    this._moveTo(this._clamp(newPos));
  },

  _targetPosition() {
    const targetWorldPos = this.target.convertToWorldSpaceAR(cc.Vec2.ZERO);
    return this.node.parent.convertToNodeSpaceAR(targetWorldPos).add(this.offset);
  },

  _clamp(newPos) {
    // Camera half-size
    const camera = this.getComponent(cc.Camera);
    const zoom = camera ? camera.zoomRatio : 1;
    const halfWidth = cc.winSize.width / 2 / zoom;
    const halfHeight = cc.winSize.height / 2 / zoom;
    newPos.x = this.bounds.right - this.bounds.left < halfWidth * 2 ? (this.bounds.left + this.bounds.right) / 2 : cc.misc.clampf(
      newPos.x,
      this.bounds.left + halfWidth,
      this.bounds.right - halfWidth
    );
    newPos.y = this.bounds.top - this.bounds.bottom < halfHeight * 2 ? (this.bounds.bottom + this.bounds.top) / 2 : cc.misc.clampf(
      newPos.y,
      this.bounds.bottom + halfHeight,
      this.bounds.top - halfHeight
    );
    return newPos;
  },

  _moveTo(position) {
    this.node.position = position;
    if (this.followInventory) this.followInventory.setPosition(position);
    if (this.followUI) this.followUI.setPosition(position);
  },
});
