// The player's look, chosen on the character customization screen and applied wherever the player appears.
// Colors tint the body, hair and clothing sprites, so white keeps the original art.
const STORAGE_KEY = 'SavedAppearance';
const HEX = /^#[0-9a-f]{6}$/i;
const SKIN_TONES = ['#FFFFFF', '#F2D8C4', '#DDB592', '#B38260', '#7C5542'];
const DEFAULTS = { name: '', skinColor: '#FFFFFF', hairColor: '#FFFFFF', clothColor: '#FFFFFF' };
const NAME_LENGTH = 12;

function normalize(value) {
  const source = value && typeof value === 'object' ? value : {};
  const color = key => typeof source[key] === 'string' && HEX.test(source[key]) ? source[key].toUpperCase() : DEFAULTS[key];
  return {
    name: typeof source.name === 'string' ? source.name.trim().slice(0, NAME_LENGTH).trim() : '',
    skinColor: color('skinColor'),
    hairColor: color('hairColor'),
    clothColor: color('clothColor'),
  };
}

function load() {
  try {
    return normalize(JSON.parse(cc.sys.localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch (error) {
    return normalize(null);
  }
}

function save(appearance) {
  try {
    cc.sys.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(appearance)));
    return true;
  } catch (error) {
    cc.warn('Could not save the character appearance.', error);
    return false;
  }
}

function apply(player, appearance) {
  if (!cc.isValid(player)) return;
  const look = normalize(appearance);
  const tint = (path, hex) => {
    const layer = cc.find(path, player);
    if (layer) layer.color = new cc.Color().fromHEX(hex);
  };
  tint('Body', look.skinColor);
  tint('Body/Hair', look.hairColor);
  tint('Body/Clothes', look.clothColor);
}

module.exports = { STORAGE_KEY, SKIN_TONES, DEFAULTS, NAME_LENGTH, normalize, load, save, apply };
