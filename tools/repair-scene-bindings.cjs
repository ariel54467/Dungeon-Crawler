const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'assets', 'scenes');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name + '.fire')));
const source = read('Overworld');
function playerAnimation(scene) {
  const player = scene.find(node => node && node.__type__ === 'cc.Node' && node._name === 'Player');
  return player._components.map(ref => scene[ref.__id__]).find(component => component.__type__ === 'cc.Animation');
}
const clips = playerAnimation(source)._clips;
for (const name of ['Home', 'HomeInside', 'testing']) {
  const scene = read(name);
  const before = JSON.stringify(scene);
  playerAnimation(scene)._clips = clips;
  if (name === 'HomeInside') {
    const trigger = scene.find(node => node && node._name === 'SaveTrigger');
    const body = trigger._components.map(ref => scene[ref.__id__]).find(component => component.__type__ === 'cc.RigidBody');
    body.enabledContactListener = true;
  }
  if (JSON.stringify(scene) !== before) {
    fs.writeFileSync(path.join(root, name + '.fire'), JSON.stringify(scene, null, 2) + '\n');
    console.log('Repaired bindings in ' + name);
  }
}
