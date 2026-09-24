# Dungeon Crawler

A 2D dungeon crawler built with Cocos Creator. The project includes overworld, home, dungeon, inventory, weapon upgrade, enemy combat, game over, and game win scenes.

## Tech Stack

- Cocos Creator 2.4.8
- JavaScript
- Firebase Hosting for the exported web build

## Project Structure

- `assets/scenes/` - Cocos scenes such as `Main Menu`, `Home`, `HomeInside`, `Overworld`, `Dungeon_2`, `Game_Over`, and `Game_Win`
- `assets/scripts/` - gameplay, player, enemy, inventory, popup, and scene manager scripts
- `assets/resources/data/` - JSON data loaded at runtime with `cc.resources.load`
- `assets/resources/Inventory/` - inventory icon assets
- `assets/sprites/`, `assets/tilemaps/`, `assets/finalTileMap/` - character, enemy, weapon, map, and tileset assets
- `build/web-mobile/` - exported web-mobile build output
- `firebase.json` - Firebase Hosting configuration

## Requirements

Install Cocos Creator 2.4.8. Use this exact major/minor version because the project was created for the `cocos-creator-js` engine in `project.json`.

Optional tools:

- Firebase CLI, only needed for deployment
- Node.js, only useful for simple syntax checks

## Open the Project

1. Open Cocos Dashboard.
2. Add this folder as an existing project.
3. Open it with Cocos Creator 2.4.8.
4. Start from `assets/scenes/Main Menu.fire` or use the scene list in the editor.

## Controls

- Move: arrow keys or `W`, `A`, `S`, `D`
- Attack: `Space`
- Debug weapon switch: `K` equips `axe_lvl_2`, `L` equips `spear_lvl_2`
- Inventory and upgrade actions are handled by scene UI buttons.

## Runtime Data

The game loads default data from:

- `assets/resources/data/GameState.json`
- `assets/resources/data/PlayerState.json`
- `assets/resources/data/InventoryDatabase.json`
- `assets/resources/data/weapons.json`

During play, saved state is stored in browser localStorage:

- `SavedGameState`
- `SavedPlayerState`
- `dungeonProgress`

Clear browser localStorage if you need to reset a test run back to the JSON defaults.

## Build

In Cocos Creator:

1. Open `Project > Build`.
2. Select the Web Mobile platform.
3. Set the output path to `build/web-mobile`.
4. Build the project.
5. Test the exported build in a browser through a local/static server.

The checked-in Firebase config serves `build/web-mobile`.

## Deploy

Firebase Hosting is configured for project `dungeoncrawler-8c423`.

```bash
firebase deploy
```

## Verification

The current source scripts have been checked with:

```powershell
Get-ChildItem -Recurse -Filter *.js assets/scripts | ForEach-Object { node --check $_.FullName }
```

JSON config/data files were also parsed successfully. After source changes, rebuild from Cocos Creator so `build/web-mobile` contains the updated scripts.
