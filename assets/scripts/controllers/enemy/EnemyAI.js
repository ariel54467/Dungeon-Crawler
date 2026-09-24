// EnemyAI.js
cc.Class({
  extends: cc.Component,

  properties: {
    // Waypoints (drag in your empty nodes in inspector)
    waypoints: {
      default: [],
      type: [cc.Node],
    },

    // Speeds (units/second)
    patrolSpeed: 50,
    chaseSpeed: 100,

    // Radii (world coordinates)
    chaseRadius: 150,
    loseRadius: 200,
    attackRadius: 40,

    // Attack timing
    attackCooldown: 1.5, // seconds between new attacks
    attackDamage: 20, // damage dealt

    // A child node that holds a CircleCollider2D + EnemyAttackHitbox.js
    attackHitbox: {
      default: null,
      type: cc.Node,
    },

    // Prefix for your animation clips (e.g. "reaper")
    animPrefix: "reaper",
    attackAnimBase: "attack",
    // (We’re using walk as our “idle,” so no separate idleAnimBase)
  },

  onLoad() {
    // 1) Enable the 2D CollisionManager once per scene:
    cc.director.getCollisionManager().enabled = true;

    // 2) Cache components
    this.anim = this.getComponent(cc.Animation);
    this.body = this.getComponent(cc.RigidBody);
    if (!this.body) {
      cc.error("EnemyAI: please add a Kinematic RigidBody2D to this node.");
    }

    // 3) Prepare the attack hitbox
    if (this.attackHitbox) {
      this.attackHitbox.active = false;
      const hbScript = this.attackHitbox.getComponent("EnemyAttackHitbox");
      if (hbScript) {
        hbScript.damage = this.attackDamage;
      } else {
        cc.error("EnemyAI: AttackHitbox missing EnemyAttackHitbox.js");
      }
    } else {
      cc.error("EnemyAI: attackHitbox property was not set in the Inspector.");
    }

    // 4) Patrol setup
    this._currentWaypointIndex = 0;
    this._patrolTarget = this.waypoints.length > 0 ? this.waypoints[0] : null;

    // 5) Find the Player node in your scene
    this.player = cc.find("Canvas/Player");
    if (!this.player) {
      cc.error("EnemyAI: cannot find 'Player' under Canvas.");
    }

    // 6) Initial state: patrol, and attack is allowed
    this._state = "patrol"; // "patrol" | "chase" | "attack"
    this._canAttack = true;

    // 7) Track last horizontal facing for the walk‐animation flip
    this._lastFacingX = 1; // +1 = right, -1 = left
  },

  update(dt) {
    if (!this.player) return;

    const enemyPos = this.node.position;
    const playerPos = this.player.position;
    const distToPlayer = enemyPos.sub(playerPos).mag();

    switch (this._state) {
      case "patrol":
        this._patrolUpdate(dt);
        // If player enters chase radius, switch to chase
        if (distToPlayer <= this.chaseRadius) {
          this._state = "chase";
        }
        break;

      case "chase":
        this._chaseUpdate(dt);
        // If player escapes beyond loseRadius, go back to patrol
        if (distToPlayer > this.loseRadius) {
          this._state = "patrol";
          // Immediately zero out velocity; next update will handle walk‐animation flip
          this.body.linearVelocity = cc.v2(0, 0);
          // Do NOT call _playWalk() here—let update()’s patrol logic flip when movement resumes
        }
        // If player close enough and attack is ready, do attack
        else if (distToPlayer <= this.attackRadius && this._canAttack) {
          this._state = "attack";
          this._doAttack();
        }
        break;

      case "attack":
        // During “attack” state, we do NOT override movement here.
        // Instead, once the attack animation ends (scheduled below), we set state to "chase" or "patrol"
        // and let the next update() call handle flipping and walking.
        break;
    }
  },

  // Move between patrol waypoints
  _patrolUpdate(dt) {
    if (!this._patrolTarget) return;

    const enemyPos = this.node.position;
    const targetPos = this._patrolTarget.position;
    const toTarget = targetPos.sub(enemyPos);
    const dist = toTarget.mag();

    if (dist < 5) {
      // We’ve reached the waypoint: stop moving but keep walk anim playing
      this.body.linearVelocity = cc.v2(0, 0);
      this._playWalk();

      // Advance to next waypoint index (circular)
      this._currentWaypointIndex =
        (this._currentWaypointIndex + 1) % this.waypoints.length;
      this._patrolTarget = this.waypoints[this._currentWaypointIndex];
      return;
    }

    // Otherwise, move toward the current waypoint
    const vel = toTarget.normalize().mul(this.patrolSpeed);
    this.body.linearVelocity = vel;

    // Flip horizontally if needed
    if (vel.x < 0) {
      this.node.scaleX = -1;
      this._lastFacingX = -1;
    } else if (vel.x > 0) {
      this.node.scaleX = 1;
      this._lastFacingX = 1;
    }

    // Always play the walk‐left or walk‐right clip
    this._playWalk();
  },

  // Chase the player directly
  _chaseUpdate(dt) {
    const enemyPos = this.node.position;
    const playerPos = this.player.position;
    const toPlayer = playerPos.sub(enemyPos);
    const dist = toPlayer.mag();

    if (dist < 1) {
      // Very close: stop moving but keep walk‐pose
      this.body.linearVelocity = cc.v2(0, 0);
      this._playWalk();
    } else {
      // Otherwise move toward the player
      const vel = toPlayer.normalize().mul(this.chaseSpeed);
      this.body.linearVelocity = vel;

      // Flip horizontally if needed
      if (vel.x < 0) {
        this.node.scaleX = -1;
        this._lastFacingX = -1;
      } else if (vel.x > 0) {
        this.node.scaleX = 1;
        this._lastFacingX = 1;
      }

      // Play left/right walk clip
      this._playWalk();
    }
  },

  // Execute the attack animation + hitbox, then immediately return to chase/patrol
  _doAttack() {
    // 1) Prevent re‐entry until cooldown is done
    this._canAttack = false;
    // 2) Stop any current movement
    this.body.linearVelocity = cc.v2(0, 0);

    // 3) Figure out which direction to face/attack
    const enemyPos = this.node.position;
    const playerPos = this.player.position;
    const delta = playerPos.sub(enemyPos);
    let attackDir = "down";
    if (Math.abs(delta.x) > Math.abs(delta.y)) {
      attackDir = delta.x > 0 ? "right" : "left";
    } else {
      attackDir = delta.y > 0 ? "up" : "down";
    }

    // 4) Play the appropriate 4‐direction attack clip
    const attackClip = `${this.animPrefix}_${this.attackAnimBase}_${attackDir}`;
    const animState = this.anim.play(attackClip);
    this.currentAnim = attackClip;

    // 5) Flip horizontally if needed
    if (attackDir === "left") {
      this.node.scaleX = -1;
      this._lastFacingX = -1;
    } else if (attackDir === "right") {
      this.node.scaleX = 1;
      this._lastFacingX = 1;
    }

    // 6) Schedule the hitbox to activate at the appropriate frame
    if (this.attackHitbox) {
      const hitStart = this.attackFirstHitDelay();
      this.scheduleOnce(() => {
        this.attackHitbox.active = true;
      }, hitStart);
      this.scheduleOnce(() => {
        this.attackHitbox.active = false;
      }, hitStart + this.attackHitDuration());
    }

    // 7) After the attack animation’s duration, immediately resume walking
    //    and set the state to chase or patrol based on current distance
    const duration = animState ? animState.clip.duration : 0.5;
    this.scheduleOnce(() => {
      const distNow = this.node.position.sub(this.player.position).mag();
      if (distNow <= this.attackRadius) {
        this._state = "chase";
      } else if (distNow <= this.chaseRadius) {
        this._state = "chase";
      } else {
        this._state = "patrol";
      }
      // Do NOT force _playWalk() here; next update() call will run patrol/chase logic
      // which flips and calls _playWalk() automatically.
    }, duration);

    // 8) Separately, re‐enable attacks only after the cooldown:
    this.scheduleOnce(() => {
      this._canAttack = true;
    }, this.attackCooldown);
  },

  // When to turn on the hitbox during the attack
  attackFirstHitDelay() {
    return 0.2;
  },
  // How long the hitbox stays active
  attackHitDuration() {
    return 0.3;
  },

  // Always play left/right walk clip (walk is used as “idle” when not moving)
  _playWalk() {
    const clipName =
      this._lastFacingX < 0
        ? `${this.animPrefix}_walk_left`
        : `${this.animPrefix}_walk_right`;
    if (this.currentAnim !== clipName) {
      this.anim.play(clipName);
      this.currentAnim = clipName;
    }
  },
});
