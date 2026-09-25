// Enemy attack clips show the wind-up, the swing and the follow-through in equal thirds.
const SWING_FRAME = 1 / 3;
const RECOVERY_TIME = 0.35;
const KNOCKBACK_TIME = 0.12;

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
    attackWindup: { default: 0.4, tooltip: 'Seconds the wind-up pose is held before the swing can hit' },
    knockbackSpeed: { default: 220, tooltip: 'Push speed when hit; 0 makes the enemy immovable' },
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
    this._knockbackTime = 0;
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
      let level = 1;
      try {
        const saved = Number(cc.sys.localStorage.getItem('currentDungeonLevel'));
        if (isFinite(saved)) level = Math.max(1, Math.min(3, Math.floor(saved)));
      } catch (error) {
        cc.warn('Using default enemy difficulty.', error);
      }
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
    this._swung = false;
    this._knockbackTime = 0;
    this._disableHitboxes();
    if (this.stats) this.stats.setTelegraph(false);
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
    if (!this.body || !cc.isValid(this.playerNode) || (this.stats && this.stats._dying)) {
      this.stopCombat();
      return;
    }
    const playerStats = this.playerNode.getComponent('PlayerStats');
    if (!playerStats || !playerStats.ready || playerStats._dead || (this.manager && (this.manager.isPaused || this.manager._transitioning))) {
      this.stopCombat();
      return;
    }
    this._cooldown = Math.max(0, this._cooldown - dt);
    if (this._knockbackTime > 0) {
      this._knockbackTime -= dt;
      if (this._knockbackTime <= 0) this.body.linearVelocity = cc.v2();
      return;
    }
    if (this._attacking) {
      this._attackTime += dt;
      this._updateAttack();
      if (this._attacking) return;
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

  _attackLength() {
    return Math.max(0, this.attackWindup) + Math.max(this.attackDuration, RECOVERY_TIME);
  },

  _tryAttack(direction) {
    if (this.manager && (this.manager.isPaused || this.manager._transitioning)) return;
    if (this._attacking || this._cooldown > 0 || (this.stats && this.stats._dying)) return;
    this.lastDir = direction;
    this._attacking = true;
    this._swung = false;
    this._attackTime = 0;
    this._attackFacing = this._directionName(direction);
    this._cooldown = Math.max(this.attackCooldown, this._attackLength());
    this.body.linearVelocity = cc.v2();
    this._disableHitboxes();
    // Hold the wind-up pose so players can read the attack before it lands.
    this.currentAnim = '';
    const state = this._play(this.enemyName + '_attack_' + this._attackFacing);
    this._attackState = state;
    if (state) state.speed = 0;
    if (this.stats) this.stats.setTelegraph(true);
    this._updateAttack();
  },

  _updateAttack() {
    const windup = Math.max(0, this.attackWindup);
    if (!this._swung && this._attackTime >= windup) {
      this._swung = true;
      if (this.stats) this.stats.setTelegraph(false);
      const hitbox = { up: this.hitboxUp, down: this.hitboxDown, left: this.hitboxLeft, right: this.hitboxRight }[this._attackFacing];
      if (hitbox) hitbox.active = true;
      const state = this._attackState;
      if (state && state.name === this.currentAnim) {
        state.speed = state.clip.speed || 1;
        this.anim.setCurrentTime(state.duration * SWING_FRAME, state.name);
      }
    }
    if (this._swung && this._attackTime >= windup + this.attackDuration) this._disableHitboxes();
    if (this._attackTime >= this._attackLength()) this.stopCombat();
  },

  knockback(direction) {
    // Committed swings are not interrupted, so rapid hits cannot stun-lock an enemy.
    if (!this.body || this._attacking || this.knockbackSpeed <= 0 || !direction.magSqr()) return;
    this._knockbackTime = KNOCKBACK_TIME;
    this.body.linearVelocity = direction.normalize().mul(this.knockbackSpeed);
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
    if (state) state.speed = state.clip.speed || 1;
  },

  _playIdleAnim() {
    const state = this._play(this.enemyName + '_walk_' + this._directionName(this.lastDir));
    if (state) state.speed = 0;
  },
});
