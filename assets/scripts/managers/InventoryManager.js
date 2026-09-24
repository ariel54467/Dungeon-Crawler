cc.Class({
  extends: cc.Component,

  properties: {
    slotPrefab: cc.Prefab,
    slotCount: 20,

    // Inventory UI
    generalInventory: cc.Node,
    generalGrid: cc.Node,
    itemTitleLabel: cc.Label,
    itemDescLabel: cc.Label,
    useButtonNode: cc.Button,
    exitButtonNode: cc.Node,

    // Equip section
    weaponInventory: cc.Node,
    weaponGrid: cc.Node,
    armorGrid: cc.Node,
    weaponSlot: cc.Node,
    armorSlot: cc.Node,
    exitButton: cc.Node,

    weaponButton: cc.Sprite,

    // Upgrade UI
    upgradeLevelLabel: cc.Node,
    upgradeCostLabel: cc.Label,
    upgradeButton: cc.Button,
  },

  onLoad() {
    this.node.zIndex = 100;
    this.ready = false;
    this.items = new Array(this.slotCount).fill(null);
    this.slots = [];
    this.loadItemIcons = {};
    this.selectedItemIndex = -1;
    this.maxUpgradeLevel = 9;
    this.playerNode = cc.find('Canvas/Player');
    this.playerStats = this.playerNode && this.playerNode.getComponent('PlayerStats');
    this.playerController = this.playerNode && this.playerNode.getComponent('PlayerController');
    if (this.exitButtonNode) this.exitButtonNode.on('click', this.hideInventory, this);
    if (this.exitButton) this.exitButton.on('click', this.hideInventory, this);
    if (this.useButtonNode) this.useButtonNode.node.on('click', this.onUseButtonClick, this);
    if (this.upgradeButton) this.upgradeButton.node.on('click', this.onUpgradeClick, this);
    if (this.playerNode) this.playerNode.on('playerStatsLoaded', this._initialize, this);
    cc.resources.load('data/InventoryDatabase', cc.JsonAsset, (error, asset) => {
      if (!cc.isValid(this.node)) return;
      if (error) {
        cc.error('Cannot load inventory.', error);
        return;
      }
      // JsonAssets are shared across scenes; unlocks must stay local to this player.
      this.itemDatabase = JSON.parse(JSON.stringify(asset.json));
      this._initialize();
    });
  },

  start() {
    this._initialize();
  },

  onEnable() {
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
  },

  onDisable() {
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
  },

  onDestroy() {
    if (cc.isValid(this.playerNode)) this.playerNode.off('playerStatsLoaded', this._initialize, this);
  },

  _initialize() {
    if (this.ready || !this.itemDatabase || !this.playerStats || !this.playerStats.ready) return;
    this.ready = true;
    this.upgradeLevel = this.playerStats.upgradeLevel;
    this.updateWeaponLevelsInDatabase();
    this.setupUI();
    this.loadEquipItems();
    this.updateUpgradeUI();
  },

  onKeyDown(event) {
    if (!this.ready) return;
    if (event.keyCode === cc.macro.KEY.i) this.toggleGeneralInventory();
    if (event.keyCode === cc.macro.KEY.e) this.toggleWeaponInventory();
    if (event.keyCode === cc.macro.KEY.escape) this.hideInventory();
  },

  setupUI() {
    if (this.useButtonNode) this.useButtonNode.node.active = false;
    if (this.generalGrid && this.slotPrefab) {
      this.generalGrid.removeAllChildren();
      for (let i = 0; i < this.slotCount; i++) {
        const slot = cc.instantiate(this.slotPrefab);
        this.generalGrid.addChild(slot);
        this.slots.push(slot);
        const button = slot.getChildByName('ItemButton') || slot;
        button.on('click', () => this.onSlotClick(null, String(i)), this);
      }
    }
    this.playerStats.savedItems.forEach(item => this.addItem(item.name, item.quantity));
  },

  _getChildComponent(node, childName, type) {
    const child = node && node.getChildByName(childName);
    return child ? child.getComponent(type) : null;
  },

  addItem(name, quantity) {
    quantity = quantity === undefined ? 1 : Math.floor(quantity);
    const def = this.itemDatabase && this.itemDatabase[name];
    if (!def || def.type !== 'consumable' || !isFinite(quantity) || quantity <= 0) return false;
    let index = this.items.findIndex(item => item && item.id === def.id);
    if (index === -1) index = this.items.indexOf(null);
    if (index === -1) return false;
    if (this.items[index]) this.items[index].quantity += quantity;
    else this.items[index] = { id: def.id, quantity: quantity };
    this.updateSlot(index);
    return true;
  },

  _definition(item) {
    return item && Object.values(this.itemDatabase).find(def => def.id === item.id);
  },

  updateSlot(index) {
    const slot = this.slots[index];
    if (!slot) return;
    const icon = this._getChildComponent(slot, 'Icon', cc.Sprite);
    const label = this._getChildComponent(slot, 'Quantity', cc.Label);
    const item = this.items[index];
    if (label) label.string = item && item.quantity > 1 ? String(item.quantity) : '';
    if (!icon) return;
    icon.spriteFrame = null;
    const def = this._definition(item);
    if (def) this.loadSprite(def.icon, sprite => {
      if (cc.isValid(icon.node) && this.items[index] === item) icon.spriteFrame = sprite;
    });
  },

  onSlotClick(event, data) {
    const index = Number(data);
    const def = this._definition(this.items[index]);
    this.selectedItemIndex = def ? index : -1;
    const descriptions = {
      heal_potion: 'Restore 30 HP',
      def_potion: '+5 defense for 15 seconds',
      inv_potion: 'Invulnerable for 5 seconds',
    };
    if (this.itemTitleLabel) this.itemTitleLabel.string = def ? def.name.replace(/_/g, ' ') : '';
    if (this.itemDescLabel) this.itemDescLabel.string = def ? descriptions[def.name] || '' : '';
    if (this.useButtonNode) this.useButtonNode.node.active = !!def;
  },

  onUseButtonClick() {
    const index = this.selectedItemIndex;
    const item = this.items[index];
    const def = this._definition(item);
    if (!def || !this.playerStats.useConsumable(def.name)) return;
    item.quantity--;
    if (item.quantity <= 0) this.items[index] = null;
    this.updateSlot(index);
    this.onSlotClick(null, -1);
    this._save();
  },

  reorganizeInventory() {
    this.items = this.items.filter(Boolean);
    while (this.items.length < this.slotCount) this.items.push(null);
    this.items.forEach((_, i) => this.updateSlot(i));
  },

  hideInventory() {
    if (this.generalInventory) this.generalInventory.active = false;
    if (this.weaponInventory) this.weaponInventory.active = false;
  },

  toggleGeneralInventory() {
    if (!this.ready || !this.generalInventory) return;
    this.generalInventory.active = !this.generalInventory.active;
    if (this.weaponInventory) this.weaponInventory.active = false;
    if (this.playerController) this.playerController.resetInput();
  },

  toggleWeaponInventory() {
    if (!this.ready || !this.weaponInventory) return;
    this.weaponInventory.active = !this.weaponInventory.active;
    if (this.generalInventory) this.generalInventory.active = false;
    this.updateUpgradeUI();
    if (this.playerController) this.playerController.resetInput();
  },

  unequipArmor() {
    this.playerStats.equippedArmor = '';
    const icon = this._getChildComponent(this.armorSlot, 'Icon', cc.Sprite);
    if (icon) icon.spriteFrame = null;
    this._save();
  },

  loadEquipItems() {
    if (!this.slotPrefab) return;
    if (this.weaponGrid) this.weaponGrid.removeAllChildren();
    if (this.armorGrid) this.armorGrid.removeAllChildren();
    Object.values(this.itemDatabase).forEach(item => {
      const grid = item.type === 'weapon' ? this.weaponGrid : item.type === 'armor' ? this.armorGrid : null;
      if (!grid) return;
      const node = cc.instantiate(this.slotPrefab);
      grid.addChild(node);
      node.opacity = item.locked ? 100 : 255;
      const buttonNode = node.getChildByName('ItemButton') || node;
      const button = buttonNode.getComponent(cc.Button);
      if (button) button.interactable = !item.locked;
      this.loadSprite(item.icon, sprite => {
        if (!cc.isValid(node)) return;
        const icon = this._getChildComponent(node, 'Icon', cc.Sprite);
        if (icon) icon.spriteFrame = sprite;
      });
      buttonNode.on('click', () => {
        if (item.locked) return;
        if (item.type === 'weapon') this.equipWeapon(item.name);
        else {
          this.playerStats.equippedArmor = this.playerStats.equippedArmor ? '' : item.name;
          this._save();
        }
      }, this);
    });
    this._updateEquippedIcon();
  },

  equipWeapon(name) {
    const item = this.itemDatabase[name];
    if (!item || item.locked || !this.playerController || !this.playerController._equipWeapon(name)) return false;
    this._updateEquippedIcon();
    this._save();
    return true;
  },

  _updateEquippedIcon() {
    const item = this.itemDatabase[this.playerStats.weapon.split('_lvl_')[0]];
    if (!item) return;
    this.equippedWeapon = item;
    this.loadSprite(item.icon, sprite => {
      const icon = this._getChildComponent(this.weaponSlot, 'Icon', cc.Sprite);
      if (icon) icon.spriteFrame = sprite;
      if (this.weaponButton) this.weaponButton.spriteFrame = sprite;
    });
  },

  loadSprite(path, callback) {
    if (this.loadItemIcons[path]) return callback(this.loadItemIcons[path]);
    cc.resources.load(path, cc.SpriteFrame, (error, sprite) => {
      if (!cc.isValid(this.node)) return;
      if (error) return cc.warn('Cannot load inventory icon ' + path, error);
      this.loadItemIcons[path] = sprite;
      callback(sprite);
    });
  },

  updateUpgradeUI() {
    if (!this.playerStats) return;
    this.money = this.playerStats.money;
    this.upgradeCost = this.upgradeLevel * 100;
    const label = this.upgradeLevelLabel && this.upgradeLevelLabel.getComponent(cc.Label);
    if (label) label.string = 'Level: ' + this.upgradeLevel + '/' + this.maxUpgradeLevel;
    if (this.upgradeCostLabel) this.upgradeCostLabel.string = this.upgradeLevel >= this.maxUpgradeLevel ? 'MAX' : '$' + this.upgradeCost;
    if (this.upgradeButton) this.upgradeButton.interactable = this.ready && this.upgradeLevel < this.maxUpgradeLevel && this.money >= this.upgradeCost;
  },

  onUpgradeClick() {
    this.updateUpgradeUI();
    if (!this.ready || this.upgradeLevel >= this.maxUpgradeLevel || this.money < this.upgradeCost || (this.playerController && this.playerController._attacking)) return;
    this.playerStats.money -= this.upgradeCost;
    this.upgradeLevel++;
    this.playerStats.upgradeLevel = this.upgradeLevel;
    this.playerStats.weaponMastery = Math.max(this.playerStats.weaponMastery, Math.ceil(this.upgradeLevel / 3));
    this.updateWeaponLevelsInDatabase();
    this.playerStats.onWeaponChanged(this.playerStats.weapon);
    this.loadEquipItems();
    this.updateUpgradeUI();
    this._save();
  },

  updateWeaponLevelsInDatabase() {
    const names = ['sword', 'axe', 'spear'];
    Object.values(this.itemDatabase).forEach(item => {
      if (item.type === 'weapon') {
        item.locked = names.indexOf(item.name) + 1 > this.playerStats.weaponMastery;
        item.level = 'lvl_' + this.playerStats.weaponLevel(item.name);
      } else if (item.type === 'armor') {
        item.locked = !this.playerStats.savedItems.some(saved => saved.name === item.name);
      }
    });
  },

  syncPlayerState() {
    this.playerStats.savedItems = this.items.filter(Boolean).map(item => ({
      name: this._definition(item).name, quantity: item.quantity,
    })).concat(this.playerStats.savedItems.filter(item => this.itemDatabase[item.name] && this.itemDatabase[item.name].type === 'armor'));
  },

  _save() {
    this.syncPlayerState();
    const manager = cc.director.getScene().getComponentInChildren('GameManager');
    if (manager) manager.saveAllGameData();
  },
});
