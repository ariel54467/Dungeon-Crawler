cc.Class({
  extends: cc.Component,
  properties: {
    maxHp: 100, hp: 100, defense: 0, exp: 0, level: 1, money: 0,
    lvlPoint: 0, healthskill: 1, speedskill: 1, dungeonLvl: 0,
    speed: 110, weaponMastery: 1, attack: 5, attackCooldown: 0.5,
    attackDuration: 0.2, color: '#FFFFFF', animPrefix: 'sword',
    weapon: 'sword_lvl_1',
    armorDefense: { default: 3, tooltip: 'Defense added while armor is equipped' },
  },

  onLoad() {
    this.ready = false;
    this._dead = false;
    this._invulnerable = 0;
    this._defenseTime = 0;
    this.upgradeLevel = 1;
    this.savedItems = [];
    this.equippedArmor = '';
    let saved;
    try {
      saved = JSON.parse(cc.sys.localStorage.getItem('SavedPlayerState') || 'null');
    } catch (error) {
      cc.warn('Ignoring unreadable player save.', error);
    }
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      this._loadState(saved);
    } else {
      cc.resources.load('data/PlayerState', cc.JsonAsset, (error, asset) => {
        if (!cc.isValid(this.node)) return;
        if (error) cc.warn('Using default player stats.', error);
        this._loadState(asset ? asset.json : {});
      });
    }
  },

  _loadState(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) state = {};
    const number = (value, fallback, min) => typeof value === 'number' && isFinite(value) ? Math.max(min, value) : fallback;
    const integer = (value, fallback, min) => Math.floor(number(value, fallback, min));
    this.maxHp = number(state.maxhp, number(state.maxHp, 100, 1), 1);
    this.hp = Math.min(this.maxHp, number(state.hp, this.maxHp, 0));
    // Older saves can contain the health recorded before the respawn was saved.
    if (this.hp === 0) this.hp = this.maxHp;
    this.defense = number(state.defense, 0, 0);
    this.exp = number(state.exp, 0, 0);
    this.level = integer(state.level, 1, 1);
    this.money = number(state.money, 0, 0);
    this.lvlPoint = integer(state.xpPoint, 0, 0);
    this.healthskill = integer(state.healthskill, 1, 1);
    this.speedskill = integer(state.speedskill, 1, 1);
    this.speed = number(state.speed, 110 + (this.speedskill - 1) * 10, 1);
    this.weaponMastery = Math.min(3, integer(state.weaponmastery, integer(state.weaponMastery, 1, 1), 1));
    this.upgradeLevel = Math.min(9, integer(state.upgradeweapon, 1, 1));
    this.savedItems = Array.isArray(state.items) ? state.items.filter(item => item && typeof item.name === 'string' && typeof item.quantity === 'number' && isFinite(item.quantity) && item.quantity >= 1).map(item => ({ name: item.name, quantity: Math.floor(item.quantity) })) : [];
    this.equippedArmor = state.equippedArmor === 'armor' && this.savedItems.some(item => item.name === 'armor') ? 'armor' : '';
    this.weapon = typeof state.weapon === 'string' ? state.weapon : 'sword_lvl_1';
    cc.resources.load('data/weapons', cc.JsonAsset, (error, asset) => {
      if (!cc.isValid(this.node)) return;
      if (error) {
        cc.error('Cannot load weapon data.', error);
        return;
      }
      this._weaponData = asset.json;
      if (!this.onWeaponChanged(this.weapon)) this.onWeaponChanged('sword');
      this.ready = true;
      this.node.emit('playerStatsLoaded');
    });
  },

  start() {
    this.manager = cc.director.getScene().getComponentInChildren('GameManager');
  },

  weaponLevel(name) {
    const offset = { sword: 0, axe: 3, spear: 6 }[name];
    return offset === undefined ? 1 : Math.max(1, Math.min(3, this.upgradeLevel - offset));
  },

  onWeaponChanged(weaponId) {
    if (!this._weaponData || typeof weaponId !== 'string') return false;
    const name = weaponId.split('_lvl_')[0];
    const mastery = { sword: 1, axe: 2, spear: 3 }[name];
    if (!mastery || this.weaponMastery < mastery) return false;
    const id = name + '_lvl_' + this.weaponLevel(name);
    const data = this._weaponData[id];
    if (!data) return false;
    this.weapon = id;
    this.attack = data.attack + (this.level - 1) * 2;
    this.attackCooldown = data.attackCooldown;
    this.attackDuration = data.attackDuration;
    this.color = data.color;
    this.animPrefix = data.animPrefix;
    if (this.ready) this.node.emit('playerStatsLoaded');
    return true;
  },

  update(dt) {
    if (this.manager && (this.manager.isPaused || this.manager._transitioning)) return;
    this._invulnerable = Math.max(0, this._invulnerable - dt);
    this._defenseTime = Math.max(0, this._defenseTime - dt);
  },

  takeDamage(amount) {
    if (this.manager && (this.manager.isPaused || this.manager._transitioning)) return false;
    if (!this.ready || this._dead || this._invulnerable > 0 || typeof amount !== 'number' || !isFinite(amount) || amount <= 0) return false;
    const defense = this.defense + (this.equippedArmor ? this.armorDefense : 0) + (this._defenseTime > 0 ? 5 : 0);
    // Defense softens hits but never makes the player immune to weak enemies.
    const damage = Math.max(1, Math.round(amount - defense));
    this.hp = Math.max(0, this.hp - damage);
    this._invulnerable = 0.6;
    this.node.emit('playerDamaged', damage);
    if (!this.hp) {
      this._dead = true;
      this.node.emit('playerDied');
      const manager = cc.director.getScene().getComponentInChildren('GameManager');
      if (manager) manager.handlePlayerDeath();
      else this.scheduleOnce(() => cc.director.loadScene('Game_Over'), 0.65);
    }
    return true;
  },

  heal(amount) {
    if (!this.ready || this._dead || this.hp >= this.maxHp || typeof amount !== 'number' || !isFinite(amount) || amount <= 0) return false;
    const healed = Math.min(this.maxHp - this.hp, amount);
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.node.emit('playerHealed', healed);
    return true;
  },

  useConsumable(name) {
    if (!this.ready || this._dead) return false;
    if (name === 'heal_potion') return this.heal(30);
    if (name === 'def_potion') {
      this._defenseTime = 15;
      return true;
    }
    if (name === 'inv_potion') {
      this._invulnerable = 5;
      return true;
    }
    return false;
  },

  gainExp(amount) {
    if (!this.ready || this._dead || typeof amount !== 'number' || !isFinite(amount) || amount <= 0 || !isFinite(this.exp + amount)) return;
    const total = this.exp + amount;
    const levels = Math.floor(total / 100);
    this.exp = total % 100;
    // Apply multiple levels together so a large saved XP value cannot stall play.
    if (levels > 0) {
      this.level += levels;
      this.lvlPoint += levels;
      this.maxHp += levels * 20;
      this.defense += levels;
      this.hp = this.maxHp;
      this.onWeaponChanged(this.weapon);
      this.node.emit('levelUp', this.level);
    }
    this.node.emit('expGained', amount);
  },

  toSaveData() {
    return {
      maxhp: this.maxHp, hp: this.hp, defense: this.defense, exp: this.exp,
      level: this.level, money: this.money, xpPoint: this.lvlPoint,
      healthskill: this.healthskill, speedskill: this.speedskill, speed: this.speed,
      weaponmastery: this.weaponMastery, upgradeweapon: this.upgradeLevel,
      weapon: this.weapon, equippedArmor: this.equippedArmor, items: this.savedItems,
    };
  },
});
