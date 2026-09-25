// Lets game scripts loaded into a test sandbox `require` other game scripts by name, as Cocos Creator does.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scripts = path.join(__dirname, '..', 'assets', 'scripts');
function findScript(name, dir = scripts) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findScript(name, file);
      if (found) return found;
    } else if (entry.name === name + '.js') return file;
  }
  return null;
}

function gameRequire(cc) {
  const cache = {};
  const load = name => {
    if (!cache[name]) {
      const file = findScript(name);
      if (!file) throw new Error('No game script named ' + name);
      const module = { exports: {} };
      cache[name] = module;
      vm.runInNewContext(fs.readFileSync(file, 'utf8'), { cc, module, exports: module.exports, require: load }, { filename: file });
    }
    return cache[name].exports;
  };
  return load;
}

module.exports = { gameRequire };
