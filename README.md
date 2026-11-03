# Axecleft's Printable Sheets (v1.11.0.0, Foundry 11)

Prints a 3.5 SRD (D35E) character, NPC or monster on paper, in one of three layouts:

* **Classic 3.5 sheet** (default): follows the layout of the 3.5 edition character sheet, with three pages
  (character and combat, gear and feats, spells). The spells page only prints for spellcasters.
  Spells are listed by level in three balanced columns; a level too long for one column carries on in the
  next under a "Level N (continued)" title. Each spellbook starts its own page.
* **eTools-style sheet**: follows the layout of eTools' standard character sheet. Sections flow from page to page
  (no forced page breaks), and spellcasters get a spells section after their feats.
* **Monster Manual stat block**: the familiar stat block (Hit Dice, Initiative, Speed, Armor Class, Base Attack/Grapple,
  Attack, Full Attack, Space/Reach, Special Attacks, Special Qualities, Saves, Abilities, Skills, Feats), the ecology lines
  (Environment, Organization, Challenge Rating, Treasure, Alignment, Advancement, Level Adjustment), spells if any,
  then the actor's biography as its description. Default for NPCs.

Choose the layouts for the Print button in **Game Settings > Configure Settings > Axecleft's Printable Sheets**:
one for player characters (default Classic) and one for NPCs (default Monster Manual stat block). Each user picks
their own. The Actors sidebar right-click menu always offers every layout.

## Merchants, loot, hoards, traps and companions
These print in a layout of their own, picked by what the actor is (the Print button and the Actors sidebar menu):
* **Merchant** (Axecleft's Shop, made by the Merchant Generator; or D35E's merchant sheet): a player gets a **price list**
  of what they can see on the sheet (no hidden items; unidentified items by the name they show), with a tick box per item
  and note lines. The GM gets the **full stock** (true names, hidden items and trade goods marked, value, price each and
  stock total) with the shop's settings (prices, trade goods %, haggling, pickpocketing and security, lock-outs, purse)
  and the latest log entries. Players need only Limited permission on a merchant to print it, as to trade.
* **Loot pile / party storage** (Axecleft's Shop; or D35E's loot sheet): a player gets the coins and contents (a closed or
  locked container shows nothing inside), with a "Taken by" column; party storage adds its log. The GM gets values,
  weights and totals, the lock, the container, the trap and the full log (secret entries included).
* **Hoard** (Axecleft's Hoard Editor): the GM gets the encounter level against the SRD treasure, what it sells for, its
  trap and where it's placed, and each item's value, sale value and weight. A player who can loot it gets a
  "treasure found" list with lines for who takes what.
* **Trap** (D35E trap actors): a DMG-style trap block (with Axecleft's Traps, Poisons, and Diseases active, the SRD stat
  line), its market price, poisons and description, and Found / Disabled / Sprung / Reset boxes. To print several on one
  page: `game.modules.get("axeclefts-printable-sheets").api.printTraps(actors, { title: "Crypt" })`.
* **Companion** (an NPC with a master, or with D35E's Animal Companion, Wizard Familiar or Paladin Mount class): the
  Monster Manual stat block with a box for its master, the SRD advancement row for the master's level, its special
  abilities, lines for tricks (animal companions) and notes. The Actors sidebar menu also offers the other layouts.

## Install
Unzip into your Foundry `Data/modules` folder so you have `Data/modules/axeclefts-printable-sheets/module.json`,
then enable **Axecleft's Printable Sheets** in your world.

## Use
* **Character sheet:** click **Print** in the sheet's title bar (or its menu).
* **Actors sidebar:** right-click a character or NPC and choose **Print: Classic 3.5 sheet**, **Print: eTools-style sheet** or **Print: Monster Manual stat block**.
The print dialog opens with the sheet (no pop-up window, so it works in the Foundry desktop app and in browsers).
Choose your printer, or "Save as PDF".
Players can print any character they can at least observe.

## What the eTools-style layout prints
Page 1: name, class, race and details; ability scores; HP, AC (with breakdown, touch, flat-footed); initiative; BAB;
saves; melee/ranged/grapple; each equipped weapon (attack, damage, critical); worn armor and shield; all skills.
Then: equipment with load limits and carried weight; money; languages; feats; special abilities (racial traits such as
senses, damage reduction, resistances, immunities, fast healing and regeneration, then racial and class features); for spellcasters,
each spellbook (caster level, spells per day, bonus spells, spells known, save DC by level, and the spells by level);
for non-casters, notes lines.

Both layouts print on whatever paper the printer uses (Letter or A4).

Totals come straight from the system's own calculations. The attack and damage line for each weapon is worked
out by the module (base melee or ranged attack + enhancement or masterwork + Weapon Focus; Strength, enhancement
and Weapon Specialization for damage). Situational bonuses from buffs or conditional feats are not added there.

## Changing the layout
* `templates/classic-sheet.hbs` and `templates/standard-sheet.hbs`: the sheets (HTML with `{{placeholders}}`).
* `styles/classic-sheet.css` and `styles/print-sheet.css`: fonts, boxes, page size and margins.
* `scripts/sheet-data.js`: builds the values the template uses.
Reload Foundry after editing.

Macro use: `game.modules.get("axeclefts-printable-sheets").api.printActor(actor, "classic")` (or `"standard"`, `"monster"`,
`"merchant"`, `"loot"`, `"hoard"`, `"trap"`, `"companion"`); `printTraps(actors)` prints several traps on one sheet.
The merchant, loot, hoard and trap layouts are `templates/shop-sheet.hbs`, `templates/contents-sheet.hbs` and
`templates/trap-sheet.hbs` with `styles/ledger-sheet.css`; their values come from `scripts/special-data.js`.

### Stat block notes
* Attack lines are built from the actor's attack items (natural attacks and weapon attacks): attack bonus = BAB +
  ability + size + the item's attack bonus (+1 for Weapon Focus); secondary natural attacks get -5 (or -2 with
  Multiattack) and half Strength to damage. Iterative attacks are added for high base attack bonuses. Actors without
  attack items use their equipped weapons.
* Space/reach follow the size table: humanoid-shaped creatures (humanoids, giants, outsiders, fey) are tall, others long.
* Special Attacks are picked from the actor's abilities by name (breath weapon, gaze, poison, improved grab, rend,
  spell-like abilities...); everything else goes under Special Qualities.
* Ecology lines the system doesn't store print as blank lines to fill in.

Blank boxes (deflection, magic and temporary save modifiers, eyes, hair, extra weapon and armor blocks) are left for writing in by hand.

## Changes
* 0.4.1: Classic sheet spell lists are balanced across the three columns, and a level that carries on into the next
  column gets a "Level N (continued)" title. Long lists start on a fresh page when that uses no more paper.

## Changelog
### 1.11.0.0 (Foundry 11; the same as 1.14.0.0)
- First release for Foundry 11.315 and D35E 2.4.3, from the Axeclefts-Printable-Sheets-v11 repository.
- New prints, each picked by what the actor is: **merchants** (a player's price list; the GM's full stock and shop settings),
  **loot piles and party storage** (contents; the GM's with values, lock, trap and log), **hoards** from the Hoard Editor
  (the GM's values against the SRD treasure for its encounter level; a player's "treasure found" list), **traps** as
  DMG-style trap blocks, and **companions** (familiars, animal companions, special mounts) as a stat block with a box for
  their master and SRD advancement.
- What a player prints is what they'd see on the sheet: no hidden items, unidentified items by the name they show, nothing
  inside a closed container.
- Prices, hoard values and trap lines come from Axecleft's Shop, Hoard Editor and Traps, Poisons, and Diseases when they're
  active, so they match those modules; without them, from the actor's own data.
- Trap actors get the Print button and Actors menu entry too. New macro: `printTraps(actors)`.
