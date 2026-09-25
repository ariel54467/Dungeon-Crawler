const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { gameRequire } = require('./game-require.cjs');

const root = path.join(__dirname, '..');

class Color {
  constructor(r = 255, g = 255, b = 255) { Object.assign(this, { r, g, b }); }
  fromHEX(hex) {
    const value = parseInt(hex.slice(1), 16);
    Object.assign(this, { r: value >> 16 & 255, g: value >> 8 & 255, b: value & 255 });
    return this;
  }
  toHEX() { return [this.r, this.g, this.b].map(v => v.toString(16).padStart(2, '0')).join(''); }
}

function game(saved = {}) {
  const storage = new Map(Object.entries(saved));
  const loaded = [];
  const pending = [];
  const cc = {
    Class: value => { cc.definition = value; },
    Component: function () {}, Sprite: function () {}, Slider: function () {}, Label: function () {},
    EditBox: function () {}, Button: function () {}, SpriteFrame: function () {}, JsonAsset: function () {},
    Color, color: (r, g, b) => new Color(r, g, b),
    isValid: value => !!value,
    find: (nodePath, node) => nodePath.split('/').reduce((current, name) => current && current.children[name], node),
    warn() {},
    sys: { localStorage: { getItem: key => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } },
    director: { loadScene: name => { loaded.push(name); return true; } },
    resources: { load: (name, type, callback) => pending.push({ name, callback }) },
  };
  const requireGame = gameRequire(cc);
  const component = file => {
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { cc, require: requireGame });
    const instance = {};
    for (const [key, value] of Object.entries(cc.definition.properties || {})) {
      instance[key] = value && typeof value === 'object' && 'default' in value ? value.default : typeof value === 'function' ? null : value;
    }
    for (const [key, value] of Object.entries(cc.definition)) if (typeof value === 'function') instance[key] = value;
    instance.node = { on() {}, parent: { addChild() {} } };
    instance.scheduleOnce = () => {};
    instance.unschedule = () => {};
    return instance;
  };
  return { cc, storage, loaded, pending, Appearance: requireGame('Appearance'), component };
}

// Objects made inside the game sandbox have their own prototypes, so compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value));
const sprite = () => ({ node: { color: new Color() }, spriteFrame: null });
const slider = progress => ({ progress });
const label = () => ({ string: '' });

function customization(saved) {
  const world = game(saved);
  const screen = world.component('assets/scripts/ui/CharacterCustomization.js');
  Object.assign(screen, {
    hairSprite: sprite(), bodySprite: sprite(), outfitSprite: sprite(),
    sliderR: slider(0.5), sliderG: slider(0.5), sliderB: slider(0.5),
    outfitSliderR: slider(0.5), outfitSliderG: slider(0.5), outfitSliderB: slider(0.5),
    labelR: label(), labelG: label(), labelB: label(), outfitLabelR: label(), outfitLabelG: label(), outfitLabelB: label(),
    skinToneLabel: label(), hairStyleLabel: label(), outfitStyleLabel: label(),
    hairStyles: ['hair'], outfitStyles: ['outfit'],
    nameBox: { string: '', placeholder: '', maxLength: 8 },
    confirmButton: { node: { on() {} } },
  });
  screen.onLoad();
  return Object.assign(world, { screen });
}

test('saved looks are validated, so a damaged save cannot break the player sprites', () => {
  const { Appearance, storage } = game({ SavedAppearance: '{"name": 42, "hairColor": "red", "skinColor": "#abcdef", "clothColor": null}' });
  assert.deepEqual(plain(Appearance.load()), { name: '', skinColor: '#ABCDEF', hairColor: '#FFFFFF', clothColor: '#FFFFFF' });
  storage.set('SavedAppearance', '{not json');
  assert.deepEqual(plain(Appearance.load()), plain(Appearance.DEFAULTS));
  assert.equal(Appearance.save({ name: '  A very long hero name  ', hairColor: '#ff0000' }), true);
  assert.deepEqual(plain(Appearance.load()), { name: 'A very long', skinColor: '#FFFFFF', hairColor: '#FF0000', clothColor: '#FFFFFF' });
});

test('the saved look tints the body, hair and clothing layers', () => {
  const { Appearance } = game();
  const layer = () => ({ color: null, children: {} });
  const hair = layer();
  const clothes = layer();
  const body = Object.assign(layer(), { children: { Hair: hair, Clothes: clothes } });
  const player = { children: { Body: body } };
  Appearance.apply(player, { skinColor: '#B38260', hairColor: '#FF6321', clothColor: '#4185FF' });
  assert.deepEqual([body.color.toHEX(), hair.color.toHEX(), clothes.color.toHEX()], ['b38260', 'ff6321', '4185ff']);
});

test('a new character starts from data/Appreance.json and the sliders, arrows and name build the saved look', () => {
  const { screen, pending, storage, loaded } = customization();
  assert.equal(pending[0].name, 'data/Appreance');
  pending[0].callback(null, { json: { skinColor: '#FFFFFF', hairColor: '#808080', clothColor: '#FFFFFF' } });
  assert.equal(screen.sliderR.progress, 128 / 255, 'sliders show the default hair color');
  assert.equal(screen.labelR.string, '128');

  screen.sliderR.progress = 1;
  screen.sliderG.progress = 0;
  screen.sliderB.progress = 0;
  screen.updateHairColorFromSliders();
  assert.equal(screen.hairSprite.node.color.toHEX(), 'ff0000', 'the preview hair follows the sliders');
  screen.outfitSliderR.progress = 0;
  screen.updateOutfitColorFromSliders();
  screen.prevSkinTone();
  assert.equal(screen.skinToneLabel.string, '5', 'skin tones wrap around');
  screen.nextSkinTone();
  screen.nextSkinTone();
  assert.equal(screen.skinToneLabel.string, '2');

  screen.nameBox.string = 'Ariel';
  screen.onConfirm();
  screen.onConfirm();
  assert.deepEqual(loaded, ['Home'], 'OK starts the game once');
  assert.deepEqual(JSON.parse(storage.get('SavedAppearance')), { name: 'Ariel', skinColor: '#F2D8C4', hairColor: '#FF0000', clothColor: '#00FFFF' });
});

test('reopening character creation shows the saved look', () => {
  const { screen, pending } = customization({ SavedAppearance: JSON.stringify({ name: 'Ariel', skinColor: '#7C5542', hairColor: '#FF6321', clothColor: '#4185FF' }) });
  assert.equal(pending.length, 0, 'no defaults are loaded over a saved character');
  assert.equal(screen.nameBox.string, 'Ariel');
  assert.equal(screen.skinToneLabel.string, '5');
  assert.equal(screen.bodySprite.node.color.toHEX(), '7c5542');
  assert.equal(screen.hairSprite.node.color.toHEX(), 'ff6321');
});

test('START creates a character on the first game and continues later; NEW GAME erases everything first', () => {
  const first = game();
  const menu = first.component('assets/scripts/managers/MainMenuManager.js');
  menu.onBtnClick();
  assert.deepEqual(first.loaded, ['CharacterCustomization']);

  const later = game({ SavedAppearance: '{}' });
  const continued = later.component('assets/scripts/managers/MainMenuManager.js');
  continued.onBtnClick();
  assert.deepEqual(later.loaded, ['Home']);

  const saved = { SavedGameState: '{}', SavedPlayerState: '{}', dungeonProgress: '{}', currentDungeonLevel: '2', SavedAppearance: '{}' };
  const restart = game(saved);
  const reset = restart.component('assets/scripts/managers/MainMenuManager.js');
  reset._newGameLabel = { string: '' };
  reset.onNewGameClick();
  assert.equal(restart.storage.size, 5, 'the first click only asks for confirmation');
  reset.onNewGameClick();
  assert.equal(restart.storage.size, 0);
  assert.deepEqual(restart.loaded, ['CharacterCustomization']);
});
