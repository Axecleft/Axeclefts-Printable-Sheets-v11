// Axecleft's Printable Sheets: print a 3.5 SRD (D35E) actor as a paper sheet
// (classic 3.5 character sheet, eTools-style character sheet, or Monster Manual-style stat block), and merchants, loot
// piles, party storage, hoards, traps and companions in layouts of their own (special-data.js).
// Adds a "Print" button to actor sheet headers and print entries to the Actors sidebar menu.
import { buildSheetData } from "./sheet-data.js";
import { buildStatBlock } from "./monster-data.js";
import { kindOf, buildShopData, buildLootData, buildHoardData, buildTrapData, companionData, companionBoxHTML } from "./special-data.js";

const MODULE_ID = "axeclefts-printable-sheets";
const LAYOUTS = {
  classic:  { label: "Classic 3.5 sheet", template: `modules/${MODULE_ID}/templates/classic-sheet.hbs`,  css: `modules/${MODULE_ID}/styles/classic-sheet.css` },
  standard: { label: "eTools-style sheet", template: `modules/${MODULE_ID}/templates/standard-sheet.hbs`, css: `modules/${MODULE_ID}/styles/print-sheet.css` },
  monster:  { label: "Monster Manual stat block", template: `modules/${MODULE_ID}/templates/monster-sheet.hbs`, css: `modules/${MODULE_ID}/styles/monster-sheet.css`, build: buildStatBlock }
};
// The layouts for actors that aren't characters: chosen by what the actor is (not offered in the settings)
const LEDGER = `modules/${MODULE_ID}/styles/ledger-sheet.css`;
const SPECIAL = {
  merchant:  { label: "Merchant price list", template: `modules/${MODULE_ID}/templates/shop-sheet.hbs`, css: LEDGER, doc: buildShopData, limited: true },
  loot:      { label: "Loot / party storage contents", template: `modules/${MODULE_ID}/templates/contents-sheet.hbs`, css: LEDGER, doc: buildLootData, limited: true },
  hoard:     { label: "Hoard", template: `modules/${MODULE_ID}/templates/contents-sheet.hbs`, css: LEDGER, doc: buildHoardData },
  trap:      { label: "Trap", template: `modules/${MODULE_ID}/templates/trap-sheet.hbs`, css: LEDGER, doc: actor => buildTrapData([actor]) },
  companion: { label: "Companion stat block", template: `modules/${MODULE_ID}/templates/monster-sheet.hbs`, css: `modules/${MODULE_ID}/styles/monster-sheet.css`,
    doc: (actor, opts) => ({ ...buildStatBlock(actor.toObject(false), opts), companionBox: companionBoxHTML(companionData(actor)) }) }
};
const layoutOf = key => LAYOUTS[key] ?? SPECIAL[key] ?? LAYOUTS.classic;
const defaultLayout = actor => kindOf(actor) ?? game.settings.get(MODULE_ID, actor?.type === "npc" ? "npcLayout" : "layout");

const renderTpl = (path, data) =>
  (foundry.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate)(path, data);

function skillLabels() {
  const out = {};
  const cfg = CONFIG.D35E?.skills ?? {};
  for (const [k, v] of Object.entries(cfg)) out[k] = game.i18n.localize(typeof v === "string" ? v : v?.label ?? k);
  return out;
}

function absolute(path) {
  if (!path || /^(https?:|data:|blob:)/.test(path)) return path;
  return new URL(path.replace(/^\//, ""), `${window.location.origin}${foundry.utils.getRoute("/")}`).href;
}

/** Print an actor: its own kind's layout (merchant, loot, hoard, trap, companion), else the layout chosen in the settings. */
export async function printActor(actor, layout = defaultLayout(actor)) {
  if (!actor) return;
  const L = layoutOf(layout);
  // Players trade and loot with Limited permission; everything else needs Observer
  if (!actor.testUserPermission(game.user, L.limited ? "LIMITED" : "OBSERVER")) {
    return ui.notifications.warn(`You need at least ${L.limited ? "Limited" : "Observer"} permission to print ${actor.name}.`);
  }
  ui.notifications.info(`Preparing ${actor.name} for printing...`);
  try {
    const opts = { skillNames: skillLabels() };
    const data = L.doc ? await L.doc(actor, opts) : (L.build ?? buildSheetData)(actor.toObject(false), opts);
    data.img = actor.type !== "trap" && actor.img && !actor.img.includes("mystery-man") ? absolute(actor.img) : null;
    await printHTML(actor.name, L, data);
  } catch (err) {
    console.error(`${MODULE_ID} |`, err);
    ui.notifications.error(`Could not build the printable sheet: ${err.message}`);
  }
}

/** Print several traps on one sheet (a room's or a dungeon's), as DMG-style trap blocks. */
export async function printTraps(actors, { title = "" } = {}) {
  const list = [...(actors ?? [])].filter(a => a?.type === "trap" && a.testUserPermission(game.user, "OBSERVER"));
  if (!list.length) return ui.notifications.warn("No traps to print.");
  try { await printHTML(title || "Traps", SPECIAL.trap, await buildTrapData(list, { title })); }
  catch (err) { console.error(`${MODULE_ID} |`, err); ui.notifications.error(`Could not build the printable sheet: ${err.message}`); }
}

/** Render a layout's template and print it. */
async function printHTML(name, L, data) {
  let frame;
  try {
    const [body, css] = await Promise.all([renderTpl(L.template, data), fetch(absolute(L.css)).then(r => r.text())]);
    const title = foundry.utils.escapeHTML?.(name) ?? name;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>`
      + `<style>${css}</style></head><body>${body}</body></html>`;

    // Print from a hidden frame inside the Foundry page: no pop-up window, so nothing for the
    // desktop app or the browser to block.
    document.getElementById("axe-print-frame")?.remove();
    frame = document.createElement("iframe");
    frame.id = "axe-print-frame";
    Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open(); doc.write(html); doc.close();

    // Wait for images (portrait) to finish or fail, at most 3 seconds, so the print is complete.
    await Promise.race([
      Promise.all([...doc.images].map(img => img.complete ? null
        : new Promise(r => { img.onload = r; img.onerror = () => { img.remove(); r(); }; }))),
      new Promise(r => setTimeout(r, 3000))
    ]);
    await new Promise(r => setTimeout(r, 200));

    const win = frame.contentWindow;
    win.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 500), { once: true });
    win.focus();
    win.print();
  } catch (err) {
    frame?.remove();
    throw err;
  }
}

// ---------- actor sheet header button (ApplicationV1 and ApplicationV2 sheets) ----------
Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
  if (!app.actor) return;
  buttons.unshift({ label: "Print", class: "axe-print-sheet", icon: "fas fa-print", onclick: () => printActor(app.actor) });
});
Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  const actor = app.document?.documentName === "Actor" ? app.document : null;
  if (!actor) return;
  controls.unshift({ icon: "fas fa-print", label: "Print Sheet", action: "axePrintSheet", onClick: () => printActor(actor) });
});

// ---------- Actors sidebar right-click entry (v12 and v13+ hook names) ----------
// A merchant, loot pile, hoard or trap gets its own print; a companion its stat block with the companion box, or any layout;
// characters and other NPCs every layout.
function contextEntries() {
  const own = Object.entries(SPECIAL).map(([key, L]) => ({
    name: `Print: ${L.label}`,
    icon: '<i class="fas fa-print"></i>',
    condition: li => kindOf(actorFromLi(li)) === key,
    callback: li => printActor(actorFromLi(li), key)
  }));
  const plain = Object.entries(LAYOUTS).map(([key, L]) => ({
    name: `Print: ${L.label}`,
    icon: '<i class="fas fa-print"></i>',
    condition: li => { const a = actorFromLi(li); return !!a && a.type !== "trap" && [null, "companion"].includes(kindOf(a)); },
    callback: li => printActor(actorFromLi(li), key)
  }));
  return [...own, ...plain];
}
function actorFromLi(li) {
  const el = li?.[0] ?? li;
  const id = el?.dataset?.entryId ?? el?.dataset?.documentId;
  const actor = game.actors.get(id);
  return actor && ["character", "npc", "trap"].includes(actor.type) ? actor : null;
}
Hooks.on("getActorContextOptions", (_app, options) => options.push(...contextEntries()));
Hooks.on("getActorDirectoryEntryContext", (_html, options) => options.push(...contextEntries()));

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "layout", {
    name: "Printed sheet layout",
    hint: "Layout used by the Print button on player characters. The Actors sidebar menu offers every layout.",
    scope: "client", config: true, type: String, default: "classic",
    choices: Object.fromEntries(Object.entries(LAYOUTS).map(([k, L]) => [k, L.label]))
  });
  game.settings.register(MODULE_ID, "npcLayout", {
    name: "Printed NPC / monster layout",
    hint: "Layout used by the Print button on NPCs and monsters.",
    scope: "client", config: true, type: String, default: "monster",
    choices: Object.fromEntries(Object.entries(LAYOUTS).map(([k, L]) => [k, L.label]))
  });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { printActor, printTraps, kindOf, layouts: [...Object.keys(LAYOUTS), ...Object.keys(SPECIAL)] };
});
