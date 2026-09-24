cc.Class({
  extends: cc.Component,
  properties: {
    waypoints: { default: [], type: [cc.Node] },
    playerNode: { default: null, type: cc.Node },
    hitboxUp: { default: null, type: cc.Node },
    hitboxDown: { default: null, type: cc.Node },
    hitboxLeft: { default: null, type: cc.Node },
    hitboxRight: { default: null, type: cc.Node },
    chaseRadius: 100, attackRadius: 30, speed: 60, chaseSpeed: 80,
    damage: 10, attackCooldown: 0.7, attackDuration: 0.3,
  },

  onLoad() {
    this.node.zIndex = 10;
    this.body = this.getComponent(cc.RigidBody);
    this.anim = this.getComponent(cc.Animation);
    this.stats = this.getComponent('EnemyStats');
    this.currentWaypointIndex = 0;
    this.currentAnim = '';
    this.lastDir = cc.v2(0, -1);
    this.chasing = false;
    this._waiting = 0;
    this._cooldown = 0;
    this._attackTime = 0;
    this._attacking = false;
    this.enemyName = { Goblin: 'goblin', GoblinSword: 'goblinSword', GoblinBoss: 'goblinBoss', Reaper: 'reaper', slime: 'slime_red' }[this.node.name] || this.node.name.toLowerCase();
    this.stopCombat();
    if (this.anim) this.anim.getClips().forEach(clip => {
      if (!clip) return;
      const state = this.anim.getAnimationState(clip.name);
      if (state) state.wrapMode = /_(attack|die|dead)/.test(clip.name) ? cc.WrapMode.Normal : cc.WrapMode.Loop;
    });
  },

  start() {
    if (!this.playerNode) this.playerNode = cc.find('Canvas/Player');
    this.manager = cc.director.getScene().getComponentInChildren('GameManager');
    if (cc.director.getScene().name === 'Dungeon_2') {
      const level = Math.max(1, Math.min(3, Number(cc.sys.localStorage.getItem('currentDungeonLevel')) || 1));
      this.damage *= 1 + (level - 1) * 0.25;
    }
  },

  onDisable() {
    this.stopCombat();
  },

  _disableHitboxes() {
    [this.hitboxUp, this.hitboxDown, this.hitboxLeft, this.hitboxRight].forEach(node => {
      if (node) node.active = false;
    });
  },

  stopCombat() {
    this._attacking = false;
    this._disableHitboxes();
    if (this.body) this.body.linearVelocity = cc.v2();
  },

  _directionName(direction) {
    return Math.abs(direction.x) > Math.abs(direction.y)
      ? (direction.x > 0 ? 'right' : 'left')
      : (direction.y > 0 ? 'up' : 'down');
  },

  _localPosition(node) {
    return this.node.parent.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2()));
  },

  update(dt) {
    if (!this.body || !cc.isValid(this.playerNode) || (this.stats && this.stats._dying)) return;
    const playerStats = this.playerNode.getComponent('PlayerStats');
    if (!playerStats || !playerStats.ready || playerStats._dead || (this.manager && this.manager.isPaused)) {
      this.stopCombat();
      return;
    }
    this._cooldown = Math.max(0, this._cooldown - dt);
    if (this._attacking) {
      this._attackTime += dt;
      if (this._attackTime >= this.attackDuration) this._disableHitboxes();
      if (this._attackTime < this.attackCooldown) return;
      this.stopCombat();
    }
    const target = this._localPosition(this.playerNode);
    const delta = target.sub(this.node.position);
    const distance = delta.mag();
    this.chasing = distance <= this.chaseRadius * (this.chasing ? 1.2 : 1);
    if (this.chasing) {
      if (distance <= this.attackRadius) {
        this.body.linearVelocity = cc.v2();
        if (this._cooldown <= 0) this._tryAttack(distance ? delta.normalize() : this.lastDir);
        else this._playIdleAnim();
      } else this._moveTowards(target, this.chaseSpeed);
    } else this._patrol(dt);
  },

  _patrol(dt) {
    if (this._waiting > 0) {
      this._waiting -= dt;
      this.body.linearVelocity = cc.v2();
      this._playIdleAnim();
      return;
    }
    const waypoint = this.waypoints[this.currentWaypointIndex];
    if (!cc.isValid(waypoint)) {
      this.body.linearVelocity = cc.v2();
      this._playIdleAnim();
      return;
    }
    const target = this._localPosition(waypoint);
    if (target.sub(this.node.position).mag() < 10) {
      this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
      this._waiting = 0.8;
      this.body.linearVelocity = cc.v2();
      this._playIdleAnim();
    } else this._moveTowards(target, this.speed);
  },

  _moveTowards(target, speed) {
    const delta = target.sub(this.node.position);
    if (delta.magSqr() < 1) {
      this.body.linearVelocity = cc.v2();
      return;
    }
    const velocity = delta.normalize().mul(speed || this.chaseSpeed);
    this.body.linearVelocity = velocity;
    this.lastDir = delta.normalize();
    this._playWalkAnim(velocity);
  },

  _tryAttack(direction) {
    if (this._attacking || this._cooldown > 0 || (this.stats && this.stats._dying)) return;
    this.lastDir = direction;
    this._attacking = true;
    this._attackTime = 0;
    this._cooldown = this.attackCooldown;
    this.body.linearVelocity = cc.v2();
    this._disableHitboxes();
    const facing = this._directionName(direction);
    const chosen = { up: this.hitboxUp, down: this.hitboxDown, left: this.hitboxLeft, right: this.hitboxRight }[facing];
    if (chosen) chosen.active = true;
    const state = this._play(this.enemyName + '_attack_' + facing);
    if (state) state.speed = state.duration / this.attackCooldown;
  },

  _play(name) {
    if (!this.anim || !this.anim.getAnimationState(name)) return null;
    const state = this.anim.getAnimationState(name);
    if (this.currentAnim !== name || !state.isPlaying) {
      this.currentAnim = name;
      return this.anim.play(name);
    }
    return state;
  },

  _playWalkAnim(velocity) {
    const state = this._play(this.enemyName + '_walk_' + this._directionName(velocity));
    if (state) state.speed = 1;
  },

  _playIdleAnim() {
    const state = this._play(this.enemyName + '_walk_' + this._directionName(this.lastDir));
    if (state) state.speed = 0;
  },
});
