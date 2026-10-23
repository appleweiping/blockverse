# Controls & Commands

## Movement

| Input | Action |
| --- | --- |
| W / A / S / D | Walk |
| Mouse | Look around (click the game once to capture the mouse) |
| Space | Jump; hold to swim upward in water |
| Ctrl (hold) | Sprint (needs food > 3 drumsticks) |
| Shift (hold) | Sneak — slower, and you cannot walk off block edges; inside a wind column, sink |
| Space ×2 (creative) | Toggle flight; Space/Shift to fly up/down |

## Interaction

| Input | Action |
| --- | --- |
| Left click (hold) | Mine the targeted block — crack overlay shows progress |
| Left click | Attack a mob |
| Right click | Place the held block |
| Right click on workbench / furnace | Open it (sneak to place a block against it instead) |
| Right click with food | Eat |
| Q | Drop one of the held item |
| 1–9 / mouse wheel | Select hotbar slot |

## Screens

| Input | Action |
| --- | --- |
| E | Open/close inventory (survival: with 2×2 crafting; creative: item palette) |
| Esc | Close screen / pause menu |
| T or / | Open chat (/ pre-fills a command) |
| ` (backquote) | Debug overlay |

### Inventory mouse rules

- Left click: pick up / swap / merge a stack
- Right click: place a single item, or split half of a stack
- Shift+click: quick-move between areas (into furnace slots, hotbar ↔ backpack)
- Shift+click a craft result: craft as many as fit into your inventory
- Click outside the window: throw the cursor stack on the ground

## Mining rules

- Each block has a hardness and an optional preferred tool class.
- Better tool tiers mine faster; some blocks need a minimum tier to drop
  anything (iron needs stone+, gold/diamond/ember need iron+, obsidian
  needs diamond).
- Tools lose 1 durability per block or hit; the bar under the icon shows wear.

## Commands

Open chat with `T` or `/`, then:

| Command | Effect |
| --- | --- |
| `/help` | List commands |
| `/tp <x> <y> <z>` | Teleport |
| `/time set <day\|noon\|sunset\|night\|midnight\|0..1>` | Set time of day |
| `/give <item> [count]` | Give items — names like `oak_planks`, `diamond_pickaxe`, `torch` |
| `/mode <survival|creative>` | Switch mode |
| `/seed` | Show the world seed |
| `/spawn` | Return to spawn |
| `/heal` | Refill health, hunger, air |
| `/kill` | Give up |
| `/clear` | Empty your inventory |
| `/rd <2-16>` | Set render distance |
