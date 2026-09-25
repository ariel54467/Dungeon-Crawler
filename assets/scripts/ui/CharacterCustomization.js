const Appearance = require('Appearance');

// Character creation before a new game: name, skin tone, and hair and outfit colors.
// The property names match the ones already saved in CharacterCustomization.fire.
cc.Class({
  extends: cc.Component,

  properties: {
    hairSprite: cc.Sprite,
    sliderR: cc.Slider,
    sliderG: cc.Slider,
    sliderB: cc.Slider,
    labelR: cc.Label,
    labelG: cc.Label,
    labelB: cc.Label,
    hairStyles: { default: [], type: [cc.SpriteFrame] },
    hairStyleLabel: cc.Label,
    currentHairIndex: 0,
    bodySprite: cc.Sprite,
    skinToneLabel: cc.Label,
    currentSkinIndex: 0,
    outfitSprite: cc.Sprite,
    outfitStyles: { default: [], type: [cc.SpriteFrame] },
    outfitStyleLabel: cc.Label,
    currentOutfitIndex: 0,
    outfitSliderR: cc.Slider,
    outfitSliderG: cc.Slider,
    outfitSliderB: cc.Slider,
    outfitLabelR: cc.Label,
    outfitLabelG: cc.Label,
    outfitLabelB: cc.Label,
    nameBox: cc.EditBox,
    confirmButton: cc.Button,
  },

  onLoad() {
    this._leaving = false;
    if (this.nameBox) {
      this.nameBox.maxLength = Appearance.NAME_LENGTH;
      this.nameBox.placeholder = 'Your name';
    }
    if (this.confirmButton) this.confirmButton.node.on('click', this.onConfirm, this);
    let saved = null;
    try { saved = cc.sys.localStorage.getItem(Appearance.STORAGE_KEY); } catch (error) { saved = null; }
    if (saved) {
      this._show(Appearance.load());
      return;
    }
    // A brand-new character starts from the defaults in data/Appreance.json.
    this._show(Appearance.normalize(Appearance.DEFAULTS));
    cc.resources.load('data/Appreance', cc.JsonAsset, (error, asset) => {
      if (error || !cc.isValid(this.node)) return;
      this._show(Appearance.normalize(Object.assign({}, asset.json, { name: this._look.name })));
    });
  },

  _show(look) {
    this._look = look;
    if (this.nameBox) this.nameBox.string = look.name;
    this.currentSkinIndex = Math.max(0, Appearance.SKIN_TONES.indexOf(look.skinColor));
    this._setSliders([this.sliderR, this.sliderG, this.sliderB], look.hairColor);
    this._setSliders([this.outfitSliderR, this.outfitSliderG, this.outfitSliderB], look.clothColor);
    this.updateHairColorFromSliders();
    this.updateOutfitColorFromSliders();
    this._showSkinTone();
    this._showStyle(this.hairSprite, this.hairStyles, this.currentHairIndex, this.hairStyleLabel);
    this._showStyle(this.outfitSprite, this.outfitStyles, this.currentOutfitIndex, this.outfitStyleLabel);
  },

  _setSliders(sliders, hex) {
    const color = new cc.Color().fromHEX(hex);
    [color.r, color.g, color.b].forEach((value, i) => {
      if (sliders[i]) sliders[i].progress = value / 255;
    });
  },

  _colorFromSliders(sliders, labels) {
    const values = sliders.map(slider => Math.round((slider ? slider.progress : 1) * 255));
    labels.forEach((label, i) => {
      if (label) label.string = String(values[i]);
    });
    return cc.color(values[0], values[1], values[2]);
  },

  updateHairColorFromSliders() {
    const color = this._colorFromSliders([this.sliderR, this.sliderG, this.sliderB], [this.labelR, this.labelG, this.labelB]);
    if (this.hairSprite) this.hairSprite.node.color = color;
    if (this._look) this._look.hairColor = '#' + color.toHEX('#rrggbb').toUpperCase();
  },

  updateOutfitColorFromSliders() {
    const color = this._colorFromSliders([this.outfitSliderR, this.outfitSliderG, this.outfitSliderB], [this.outfitLabelR, this.outfitLabelG, this.outfitLabelB]);
    if (this.outfitSprite) this.outfitSprite.node.color = color;
    if (this._look) this._look.clothColor = '#' + color.toHEX('#rrggbb').toUpperCase();
  },

  nextSkinTone() {
    this.currentSkinIndex = (this.currentSkinIndex + 1) % Appearance.SKIN_TONES.length;
    this._showSkinTone();
  },

  prevSkinTone() {
    const count = Appearance.SKIN_TONES.length;
    this.currentSkinIndex = (this.currentSkinIndex - 1 + count) % count;
    this._showSkinTone();
  },

  _showSkinTone() {
    const hex = Appearance.SKIN_TONES[this.currentSkinIndex];
    if (this.bodySprite) this.bodySprite.node.color = new cc.Color().fromHEX(hex);
    if (this.skinToneLabel) this.skinToneLabel.string = String(this.currentSkinIndex + 1);
    if (this._look) this._look.skinColor = hex;
  },

  // The game has animated art for one hairstyle and outfit, so these only cycle what the scene provides.
  nextHairStyle() { this._cycleHair(1); },
  prevHairStyle() { this._cycleHair(-1); },
  nextOutfitStyle() { this._cycleOutfit(1); },
  prevOutfitStyle() { this._cycleOutfit(-1); },

  _cycleHair(step) {
    const count = this.hairStyles.length || 1;
    this.currentHairIndex = (this.currentHairIndex + step + count) % count;
    this._showStyle(this.hairSprite, this.hairStyles, this.currentHairIndex, this.hairStyleLabel);
  },

  _cycleOutfit(step) {
    const count = this.outfitStyles.length || 1;
    this.currentOutfitIndex = (this.currentOutfitIndex + step + count) % count;
    this._showStyle(this.outfitSprite, this.outfitStyles, this.currentOutfitIndex, this.outfitStyleLabel);
  },

  _showStyle(sprite, styles, index, label) {
    if (sprite && styles[index]) sprite.spriteFrame = styles[index];
    if (label) label.string = String(index + 1);
  },

  onConfirm() {
    if (this._leaving || !this._look) return;
    this._look.name = this.nameBox ? this.nameBox.string : '';
    if (!Appearance.save(this._look)) return;
    this._leaving = true;
    cc.director.loadScene('Home');
  },
});
