// Axecleft's Printable Sheets: the data for the prints that aren't character sheets.
//   merchant  - an Axecleft's Shop merchant (Merchant Generator): a price list for a player, the full stock and settings for the GM
//   loot      - an Axecleft's Shop loot pile or party storage, or D35E's loot sheet: the contents (and, for the GM, lock, trap, values)
//   hoard     - an Axecleft's Hoard Editor hoard: a "treasure found" list for a player, values and the SRD target for the GM
//   trap      - D35E trap actors as DMG-style trap blocks (the SRD stat line from Axecleft's Traps, Poisons, and Diseases when active)
//   companion - a familiar, animal companion, paladin's mount or psicrystal: the stat block plus a box with its master and advancement
// What a player gets is what they would see on the sheet: no hidden items, unidentified items by the name they show.
// The other modules are read through their APIs when they're active (prices, hoard values, trap lines); without them the
// values come from the actor's own data.

const num = v => (typeof v === "number" ? v : Number(v) || 0);
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const getP = (o, path) => path.split(".").reduce((x, k) => x?.[k], o);
const itemsOf = actor => [...(actor?.items ?? [])];
const gpText = n => {
  const v = Math.round(num(n) * 100) / 100;
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })} gp`;
};
const printedOn = () => new Date().toLocaleDateString();
const ord = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const span = r => `${ord(r[0])}-${ord(r[1])}`;

// ---------- what kind of actor ----------
const SHOP_SHEET = "axecleft.AxecleftShopSheet";
const HOARDS = "axeclefts-hoards";
export const shopFlags = actor => actor?.flags?.world?.axecleftShop ?? null;
export const isHoard = actor => !!actor?.flags?.[HOARDS]?.hoard;
const minionClass = actor => itemsOf(actor).find(i => i.type === "class" && i.system?.classType === "minion") ?? null;

/** "merchant", "loot", "hoard", "trap", "companion", or null for an ordinary character or NPC. */
export function kindOf(actor) {
  if (!actor) return null;
  if (actor.type === "trap") return "trap";
  if (isHoard(actor)) return "hoard";
  const sheet = actor.flags?.core?.sheetClass ?? "";
  const shop = shopFlags(actor);
  if (sheet === SHOP_SHEET || shop) return ["loot", "storage"].includes(shop?.mode) ? "loot" : "merchant";
  if (/Loot/i.test(sheet)) return actor.flags?.D35E?.lootsheettype === "Merchant" ? "merchant" : "loot";
  if (actor.type === "npc" && (actor.system?.master?.id || minionClass(actor))) return "companion";
  return null;
}

// ---------- items ----------
const PHYSICAL = ["weapon", "equipment", "consumable", "loot", "valuable"];
const GROUPS = [["weapon", "Weapons"], ["equipment", "Armor and gear"], ["consumable", "Consumables"], ["loot", "Goods and loot"]];
const qtyOf = i => { const q = i.system?.quantity; return q == null || q === "" ? 1 : Math.max(0, num(q)); };
const unidentified = i => i.system?.identified === false;
const shownName = i => (unidentified(i) && i.system?.unidentified?.name ? i.system.unidentified.name : i.name);
const isHidden = i => !!i.flags?.world?.axecleftHidden;
const inContainer = i => { const c = i.system?.containerId; return !!c && c !== "none"; };
const isTradeGoods = i => !!i.system?.fullResalePrice;
/** One piece's value in gp (D35E: an unidentified item at its unidentified price). */
const valueOf = i => {
  const s = i.system ?? {};
  return num(unidentified(i) && s.unidentified && s.unidentified.price != null && s.unidentified.price !== "" ? s.unidentified.price : s.price);
};
const weightOf = i => num(i.system?.weight);
/** The items on show, by group: [{ label, rows: [...] }]. */
function grouped(items, row) {
  return GROUPS.map(([type, label]) => ({
    label,
    rows: items.filter(i => i.type === type || (type === "loot" && i.type === "valuable"))
      .sort((a, b) => shownName(a).localeCompare(shownName(b))).map(row)
  })).filter(g => g.rows.length);
}
const onShow = (actor, gm) => itemsOf(actor).filter(i => PHYSICAL.includes(i.type) && !inContainer(i) && (gm || !isHidden(i)));

// ---------- coins ----------
const COINS = ["pp", "gp", "sp", "cp"];
const COIN_GP = { pp: 10, gp: 1, sp: 0.1, cp: 0.01 };
function coins(actor) {
  const c = actor?.system?.currency ?? {}, alt = actor?.system?.altCurrency ?? {};
  const list = COINS.map(k => ({ coin: k, n: num(c[k]) + num(alt[k]) })).map(x => ({ ...x, count: x.n.toLocaleString("en-US") }));
  const total = list.reduce((n, x) => n + x.n * COIN_GP[x.coin], 0);
  const weight = COINS.reduce((n, k) => n + num(c[k]), 0) / 50; // carried coins: 50 to the pound (weightless ones weigh nothing)
  return { list, total, weight, text: list.filter(x => x.n).map(x => `${x.count} ${x.coin}`).join(", ") || "none" };
}

// ---------- the Shop's settings (Axecleft's Shop when loaded, else its saved flags) ----------
const Trade = () => globalThis.AxecleftTrade ?? null;
function shopSettings(actor) {
  const api = Trade();
  if (api?.shopOf) return api.shopOf(actor);
  const own = shopFlags(actor) ?? {}, gen = actor?.flags?.world?.axecleftMerchant ?? {}, d35 = actor?.flags?.D35E ?? {};
  const pct = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);
  return {
    mode: own.mode ?? "merchant",
    sell: pct(own.sell, d35.priceModifier != null ? Math.round(num(d35.priceModifier) * 100) : pct(gen.sell, 100)),
    buy: pct(own.buy, d35.priceModifierBuy != null ? Math.round(num(d35.priceModifierBuy) * 100) : pct(gen.buy, 50)),
    tradeSell: pct(own.tradeSell, 100), tradeBuy: pct(own.tradeBuy, 100), tradeOwn: own.tradeSell != null || own.tradeBuy != null,
    haggle: !!own.haggle, skills: { dip: own.skills?.dip !== false, int: own.skills?.int !== false, blf: !!own.skills?.blf },
    haggles: own.haggles ?? {}, steal: own.steal !== false, locked: own.locked ?? {},
    security: Array.isArray(own.security) ? own.security : Array.isArray(gen.security) ? gen.security : [],
    chat: own.chat ?? "public", shopName: gen.shop ?? ""
  };
}
function lootSettings(actor) {
  const api = Trade();
  if (api?.lootOf) return api.lootOf(actor);
  const o = shopFlags(actor) ?? {};
  return {
    lock: { locked: false, quality: "average", dc: 25, key: "", arcane: false, box: "treasure", hardness: 5, hp: 15, breakDc: 23, broken: false, ...(o.lock ?? {}) },
    trap: { armed: false, actor: "", name: "", searchDc: 20, disableDc: 20, save: "ref", saveDc: 15, damage: "", half: true, poison: "", found: [], ...(o.trap ?? {}) },
    opened: o.opened !== false, split: !!o.split, log: Array.isArray(o.log) ? o.log : []
  };
}
const SECURITY = { careless: "careless / distracted (Spot -4, DCs -2)", crowded: "crowded / busy (Spot -2)", watchful: "watchful owner (Spot +4)",
  guards: "guards on duty (Spot +5)", animal: "guard animal (Spot +3)", locked: "goods locked away (shoplifting DC +10)",
  strongbox: "coin kept secure (pickpocketing DC +5)", warded: "magically warded (shoplifting: Spot +10)" };
const HAGGLE = { dip: "Diplomacy", int: "Intimidate", blf: "Bluff" };
const CHAT = { public: "shown in chat for everyone", gm: "shown to the GM only", none: "not shown in chat" };
const LOCKS = { simple: "very simple lock", average: "average lock", good: "good lock", amazing: "amazing lock" };
const BOXES = { small: "small chest", treasure: "treasure chest", custom: "container" };
const SAVES = { ref: "Reflex", fort: "Fortitude", will: "Will", none: "no save" };
const actorName = id => (id && globalThis.game?.actors?.get?.(id)?.name) || "?";
const openTo = actor => (num(actor?.ownership?.default) >= 1 ? "all players" : "players set in Ownership");
function logRows(L, gm) {
  const when = ms => { try { return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
  return L.log.filter(e => gm || !e.secret).slice(-25).reverse().map(e => ({ when: when(e.t), text: e.text, secret: !!e.secret }));
}
/** The character a player prints as (their assigned character, else the first they own). */
function myCharacter() {
  const u = globalThis.game?.user;
  return u?.character ?? [...(globalThis.game?.actors ?? [])].find(a => a.type === "character" && a.isOwner) ?? null;
}

// ---------- merchant ----------
export function buildShopData(actor, { gm = !!globalThis.game?.user?.isGM } = {}) {
  const s = shopSettings(actor), api = Trade();
  const price = i => (api?.askPrice ? api.askPrice(actor, i, null) / 100 : valueOf(i) * (isTradeGoods(i) ? s.tradeSell : s.sell) / 100);
  let stock = 0;
  const groups = grouped(onShow(actor, gm), i => {
    const q = qtyOf(i), each = price(i);
    stock += each * q;
    return { name: gm ? i.name : shownName(i), shownAs: gm && unidentified(i) && shownName(i) !== i.name ? shownName(i) : "",
      hidden: gm && isHidden(i), tradeGoods: gm && isTradeGoods(i), qty: q, value: gpText(valueOf(i)), price: gpText(each), total: gpText(each * q) };
  });
  const purse = coins(actor), me = gm ? null : myCharacter();
  const skills = Object.entries(HAGGLE).filter(([k]) => s.skills?.[k]).map(([, v]) => v).join(", ");
  const haggled = Object.values(s.haggles ?? {}).map(h => `${h.name ?? "?"} ${h.refused ? "refused" : `${num(h.pct) >= 0 ? "+" : ""}${num(h.pct)}%`}`).join(", ");
  return {
    name: actor.name, gm,
    subLine: [s.shopName && !actor.name.includes(s.shopName) ? s.shopName : "", gm ? `sells at ${s.sell}%, buys at ${s.buy}%` : `it buys at ${s.buy}% of value`, s.haggle ? "haggles" : ""].filter(Boolean).join(" · "),
    tradingAs: me ? `${me.name} (purse ${gpText(coins(me).total)})` : "",
    groups, stockTotal: gpText(stock), cols: gm ? 5 : 4,
    settings: gm ? [
      ["Sells at / buys at", `${s.sell}% / ${s.buy}% of value`],
      ["Trade goods", `${s.tradeSell}% / ${s.tradeBuy}%${s.tradeOwn ? "" : " (world rule)"}`],
      ["Open to", openTo(actor)],
      ["Trades", CHAT[s.chat] ?? s.chat],
      ["Haggling", s.haggle ? `${skills || "no skills ticked"} (you approve each)` : "not allowed"],
      ...(haggled ? [["Haggled", haggled]] : []),
      ["Pickpocketing", s.steal ? "allowed (you decide each)" : "not allowed"],
      ["Security", (s.security ?? []).map(k => SECURITY[k] ?? k).join("; ") || "none"],
      ...(Object.keys(s.locked ?? {}).length ? [["Locked out", Object.values(s.locked).join(", ")]] : []),
      ["Purse", `${purse.text} (${gpText(purse.total)})`]
    ] : [],
    log: gm ? logRows(lootSettings(actor), true) : [],
    noteLines: gm ? [] : Array.from({ length: 5 }),
    printedOn: printedOn()
  };
}

// ---------- loot pile, party storage, D35E loot sheet ----------
export function buildLootData(actor, { gm = !!globalThis.game?.user?.isGM } = {}) {
  const s = shopSettings(actor), L = lootSettings(actor), axe = !!shopFlags(actor);
  const storage = s.mode === "storage";
  const closed = axe && (L.lock.locked || !L.opened);
  const status = !axe ? "" : L.lock.broken ? "broken open" : L.lock.locked ? "locked" : !L.opened ? "closed" : "open";
  const showContents = gm || !closed;
  let total = 0, weight = 0;
  const groups = showContents ? grouped(onShow(actor, gm), i => {
    const q = qtyOf(i), v = valueOf(i);
    total += v * q; weight += weightOf(i) * q;
    return { name: gm ? i.name : shownName(i), shownAs: gm && unidentified(i) && shownName(i) !== i.name ? shownName(i) : "", hidden: gm && isHidden(i),
      qty: q, value: gpText(v), total: gpText(v * q), weight: `${Math.round(weightOf(i) * q * 100) / 100} lb.` };
  }) : [];
  const purse = coins(actor);
  const tr = L.trap, trActor = tr.actor ? globalThis.game?.actors?.get?.(tr.actor) : null;
  const trapLine = !tr.armed ? "none" : trActor
    ? `${trActor.name} (trap actor): Search DC ${num(trActor.system?.details?.findDC) || tr.searchDc}, Disable Device DC ${num(trActor.system?.details?.disarmDC) || tr.disableDc}`
    : `${tr.name || "trap"}: Search DC ${tr.searchDc}, Disable Device DC ${tr.disableDc}; ${SAVES[tr.save] ?? tr.save}${tr.save !== "none" ? ` DC ${tr.saveDc}` : ""}${tr.damage ? `, ${tr.damage}${tr.half ? " (half on a save)" : ""}` : ""}${tr.poison ? `; ${tr.poison}` : ""}`;
  const lk = L.lock;
  return {
    name: actor.name, gm, kindLabel: storage ? "Party storage" : "Loot", status,
    closedNote: !gm && closed ? `${actor.name} is ${status}: what's inside isn't shown until it's opened.` : "",
    coins: showContents ? purse.list : [], coinsTotal: gm ? `${gpText(purse.total)}; ${Math.round(purse.weight * 100) / 100} lb.` : "",
    groups, cols: gm ? 5 : 3,
    totals: gm ? [["Items", gpText(total), `${Math.round(weight * 100) / 100} lb.`], ["Coins", gpText(purse.total), `${Math.round(purse.weight * 100) / 100} lb.`],
      ["All of it", gpText(total + purse.total), `${Math.round((weight + purse.weight) * 100) / 100} lb.`]] : [],
    settings: gm && axe ? [
      ["Open to", openTo(actor)], ["Taken and put in", CHAT[s.chat] ?? s.chat], ["Splitting coins", L.split ? "players can split them" : "the GM splits them"],
      ["Container", `${BOXES[lk.box] ?? lk.box}: hardness ${lk.hardness}, ${lk.hp} hp, Break DC ${lk.breakDc}${lk.broken ? " (broken)" : ""}`],
      ["Lock", lk.locked ? `locked; ${LOCKS[lk.quality] ?? "lock"}, Open Lock DC ${num(lk.dc) + (lk.arcane ? 10 : 0)}${lk.arcane ? " (arcane lock +10)" : ""}${lk.key ? `; key: ${lk.key}` : ""}` : "unlocked"],
      ["Trap", trapLine + (tr.armed && tr.found?.length ? `. Found by ${tr.found.map(actorName).join(", ")}` : tr.armed ? ". Found by nobody" : "")],
      ["Players see it", status]
    ] : [],
    log: gm || storage ? logRows(L, gm) : [],
    takenBy: !gm,
    printedOn: printedOn()
  };
}

// ---------- hoard (Axecleft's Hoard Editor) ----------
const SRD_TREASURE = [300, 600, 900, 1200, 1600, 2000, 2600, 3400, 4500, 5800, 7500, 9800, 13000, 17000, 22000, 28000, 36000, 47000, 61000, 80000];
export function buildHoardData(actor, { gm = !!globalThis.game?.user?.isGM } = {}) {
  const api = globalThis.game?.modules?.get?.(HOARDS)?.api ?? null;
  const info = actor.flags?.[HOARDS]?.hoard ?? {};
  const sellPct = Number.isFinite(Number(info.sellPct)) && info.sellPct !== null && info.sellPct !== "" ? Number(info.sellPct) : 50;
  const isGoods = i => i.type === "valuable" || (i.type === "loot" && (["tradeGoods", "gem"].includes(i.system?.subType) || isTradeGoods(i)));
  let goods = 0, items = 0, weight = 0;
  const groups = grouped(onShow(actor, gm), i => {
    const q = qtyOf(i), v = num(i.system?.price), g = isGoods(i);
    if (g) goods += v * q; else items += v * q;
    weight += weightOf(i) * q;
    return { name: gm ? i.name : shownName(i), shownAs: gm && unidentified(i) && shownName(i) !== i.name ? shownName(i) : "", hidden: gm && isHidden(i),
      qty: q, value: gpText(v), total: gpText(v * q), sells: gpText(v * q * (g ? 1 : sellPct / 100)), weight: `${Math.round(weightOf(i) * q * 100) / 100} lb.` };
  });
  const purse = coins(actor);
  let v = { coins: purse.total, goods, items, total: purse.total + goods + items };
  try { if (api?.value) v = api.value(actor); } catch (e) { /* the actor's own numbers */ }
  let sells = v.coins + v.goods + v.items * sellPct / 100;
  try { if (api?.sellValue) sells = api.sellValue(actor); } catch (e) { /* as above */ }
  let w = { coins: purse.weight, items: weight, total: purse.weight + weight };
  try { if (api?.weight) w = api.weight(actor); } catch (e) { /* as above */ }
  const el = num(info.el), target = el ? SRD_TREASURE[Math.min(20, Math.max(1, el)) - 1] : 0;
  const trap = info.trap ? (globalThis.fromUuidSync?.(info.trap) ?? null) : null;
  const scene = [...(globalThis.game?.scenes ?? [])].filter(sc => [...(sc.tokens ?? [])].some(tk => tk.actorId === actor.id)).map(sc => sc.name).join(", ");
  return {
    name: actor.name, gm, kindLabel: gm ? "Hoard" : "Treasure found",
    coins: purse.list, coinsTotal: gm ? `${gpText(v.coins)}; ${Math.round(num(w.coins) * 100) / 100} lb.` : "",
    groups, cols: gm ? 6 : 2, hoard: true,
    totals: gm ? [["Coins / goods / items", `${gpText(v.coins)} / ${gpText(v.goods)} / ${gpText(v.items)}`, ""], ["The hoard", gpText(v.total), `sells for ${gpText(sells)}; ${Math.round(num(w.total) * 100) / 100} lb.`]] : [],
    settings: gm ? [
      ["Encounter level", el ? `EL ${el}: SRD treasure ${gpText(target)}` : "not set"],
      ["This hoard", el ? `${gpText(v.total)} (${v.total >= target ? "+" : "-"}${gpText(Math.abs(v.total - target))} ${v.total >= target ? "over" : "under"})` : gpText(v.total)],
      ["Sells for", `${gpText(sells)} (items at ${sellPct}%)`],
      ["Trap", trap ? `${trap.name}: Search DC ${num(trap.system?.details?.findDC) || "?"}, Disable Device DC ${num(trap.system?.details?.disarmDC) || "?"}` : "none"],
      ...(scene ? [["On the scene", scene]] : []),
      ["Players can loot it", num(actor.ownership?.default) >= 2 ? "yes" : "no"]
    ] : [],
    log: [], shareLines: gm ? [] : Array.from({ length: 6 }),
    printedOn: printedOn()
  };
}

// ---------- traps ----------
const plain = html => String(html ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").trim();
const TRIGGER_LINE = /^(\w+(?: \(\w+\))?) trigger$/i, SAVE_LINE = /^save dc \d+$/i, PRICE_LINE = /^(market price|cost)\b/i;
/** One trap block: { name, line, price, extra: [text], description }. */
export async function buildTrapBlock(actor) {
  const det = actor.system?.details ?? {};
  const cr = num(det.totalCr ?? det.cr);
  const notes = plain(det.notes?.value).split("\n").map(s => s.trim()).filter(Boolean);
  let text = null;
  try {
    const facts = globalThis.game?.modules?.get?.("traps-and-poisons")?.api?.trapFacts;
    if (facts) text = (await facts(actor))?.text ?? null;
  } catch (e) { /* not a trap the Traps module knows */ }
  const priceNote = notes.find(n => PRICE_LINE.test(n));
  const price = priceNote ? priceNote.replace(/^market price\s*[-:–]\s*/i, "Market Price: ").replace(/^cost\s*[-:–]\s*/i, "Cost: ") : "";
  let line;
  if (text) line = text.replace(new RegExp(`^${actor.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*`, "i"), "");
  else {
    const trigger = notes.find(n => TRIGGER_LINE.test(n));
    const rest = notes.filter(n => n !== trigger && !SAVE_LINE.test(n) && !PRICE_LINE.test(n));
    line = [`CR ${cr || "?"}`, trigger ? trigger.toLowerCase() : "", ...rest, `Search DC ${num(det.findDC) || "?"}`, `Disable Device DC ${num(det.disarmDC) || "?"}`].filter(Boolean).join("; ");
  }
  if (!/\.$/.test(line)) line += ".";
  // The trap's poisons and diseases in full, from its items, when they say more than the stat line
  const extra = itemsOf(actor).filter(i => /poison|disease/i.test(`${i.name} ${i.system?.subType ?? ""}`) && i.type !== "attack")
    .map(i => `${i.name}: ${plain(i.system?.description?.value).split("\n")[0]}`).filter(s => s.length > 4).slice(0, 4);
  const description = plain(det.biography?.value);
  return { name: actor.name, line, price: price ? (/\.$/.test(price) ? price : `${price}.`) : "", extra, description, hasExtra: !!(extra.length || description) };
}
export async function buildTrapData(actors, { title = "" } = {}) {
  const traps = [];
  for (const a of actors) traps.push(await buildTrapBlock(a));
  return { title: title || (traps.length === 1 ? traps[0].name : "Traps"), subLine: traps.length > 1 ? `${traps.length} traps` : "", traps, printedOn: printedOn() };
}

// ---------- companions (familiar, animal companion, paladin's mount, psicrystal) ----------
// SRD advancement by the master's level for the companion's kind (D35E's minion groups)
const ANIMAL = [[1, 2, "+0", "+0", "+0", 1, "Link, share spells"], [3, 5, "+2", "+2", "+1", 2, "Evasion"], [6, 8, "+4", "+4", "+2", 3, "Devotion"],
  [9, 11, "+6", "+6", "+3", 4, "Multiattack"], [12, 14, "+8", "+8", "+4", 5, ""], [15, 17, "+10", "+10", "+5", 6, "Improved evasion"], [18, 20, "+12", "+12", "+6", 7, ""]];
const FAMILIAR = [[1, 2, "+1", 6, "Alertness, improved evasion, share spells, empathic link"], [3, 4, "+2", 7, "Deliver touch spells"], [5, 6, "+3", 8, "Speak with master"],
  [7, 8, "+4", 9, "Speak with animals of its kind"], [9, 10, "+5", 10, ""], [11, 12, "+6", 11, "Spell resistance"], [13, 14, "+7", 12, "Scry on familiar"],
  [15, 16, "+8", 13, ""], [17, 18, "+9", 14, ""], [19, 20, "+10", 15, ""]];
const MOUNT = [[5, 7, "+2", "+4", "+1", 6, "Empathic link, improved evasion, share spells, share saving throws"], [8, 10, "+4", "+6", "+2", 7, "Improved speed"],
  [11, 14, "+6", "+8", "+3", 8, "Command creatures of its kind"], [15, 20, "+8", "+10", "+4", 9, "Spell resistance"]];
const FEATURES = {
  "link": "The master handles the animal as a free action (push it as a move action) and gets +4 on wild empathy and Handle Animal checks with it.",
  "share spells": "A spell the master casts on himself can also affect the companion within 5 ft.; spells with a target of \"You\" can be cast on it.",
  "evasion": "No damage on a successful Reflex save for half.",
  "devotion": "+4 morale bonus on Will saves against enchantment spells and effects.",
  "multiattack": "Gains Multiattack as a bonus feat if it has three or more natural attacks (or a second attack with its primary natural weapon at -5).",
  "improved evasion": "No damage on a successful Reflex save, half damage on a failed one.",
  "alertness": "While the familiar is within arm's reach, the master has the Alertness feat.",
  "empathic link": "Telepathic link to 1 mile: they share emotions, not senses.",
  "deliver touch spells": "The familiar delivers the master's touch spells for him.",
  "speak with master": "The familiar and the master talk in a language others can't understand without magic.",
  "speak with animals of its kind": "The familiar can talk with animals of about its kind.",
  "spell resistance": "Spell resistance equal to the master's level + 5.",
  "scry on familiar": "Once a day the master can scry on the familiar (as the scrying spell).",
  "share saving throws": "The mount uses its own base save or the paladin's, whichever is higher.",
  "improved speed": "+10 ft. to the mount's speed.",
  "command creatures of its kind": "Once a day per two paladin levels, the mount can command other animals of its kind (as command)."
};
function featureList(text) { return String(text).split(/,\s*/).map(s => s.trim()).filter(Boolean); }
/** The companion box's data, or null. */
export function companionData(actor) {
  const mc = minionClass(actor);
  const group = String(mc?.system?.minionGroup ?? "").toLowerCase();
  const level = num(mc?.system?.levels);
  const masterId = actor.system?.master?.id;
  const master = (masterId && globalThis.game?.actors?.get?.(masterId)) || null;
  const masterName = master?.name ?? actor.system?.master?.name ?? "";
  if (!mc && !masterName) return null;
  const masterClasses = master ? itemsOf(master).filter(i => i.type === "class" && i.system?.classType !== "minion").map(c => `${c.name} ${num(c.system?.levels)}`).join(" / ") : "";
  const kind = group === "animalcompanion" ? "Animal companion" : group === "wizard" ? "Familiar" : group === "paladin" ? "Special mount" : group === "psion" ? "Psicrystal" : (mc?.name ?? "Companion");
  const row = list => list.filter(r => level >= r[0] && level <= r[1]).at(-1) ?? null;
  const upTo = (list, idx) => list.filter(r => level >= r[0]).flatMap(r => featureList(r[idx]));
  let table = null, features = [], tricks = null;
  if (group === "animalcompanion") {
    const r = row(ANIMAL);
    if (r) table = { head: ["Class level", "Bonus HD", "Natural armor adj.", "Str/Dex adj.", "Bonus tricks", "Special"], cells: [span(r), r[2], r[3], r[4], r[5], r[6] || "-"] };
    features = upTo(ANIMAL, 6);
    const int = num(actor.system?.abilities?.int?.total ?? actor.system?.abilities?.int?.value);
    const count = (int >= 3 ? 0 : 3 * Math.max(1, int)) + (r ? r[5] : 0);
    tricks = { label: int >= 3 ? `Tricks known (Int ${int}: as many as it learns, plus ${r ? r[5] : 0} bonus)` : `Tricks known (${count}: ${3 * Math.max(1, int)} as an animal of Int ${int || 1}, plus ${r ? r[5] : 0} bonus)`,
      lines: Array.from({ length: Math.max(count, 6) }) };
  } else if (group === "wizard") {
    const r = row(FAMILIAR);
    if (r) table = { head: ["Master level", "Natural armor adj.", "Int", "Special"], cells: [span(r), r[2], r[3], r[4] || "-"] };
    features = upTo(FAMILIAR, 4);
  } else if (group === "paladin") {
    const r = row(MOUNT);
    if (r) table = { head: ["Paladin level", "Bonus HD", "Natural armor adj.", "Str adj.", "Int", "Special"], cells: [span(r), r[2], r[3], r[4], r[5], r[6] || "-"] };
    features = upTo(MOUNT, 6);
  }
  const notes = features.map(f => ({ name: f.charAt(0).toUpperCase() + f.slice(1), text: FEATURES[f.toLowerCase()] ?? "" })).filter(f => f.text);
  return {
    title: `${kind} of ${masterName || "?"}${masterClasses ? ` (${masterClasses})` : level ? ` (level ${level})` : ""}`,
    table, notes, tricks, noteLines: Array.from({ length: 2 })
  };
}
/** The box as HTML (the stat block template prints it under the stat block). */
export function companionBoxHTML(c) {
  if (!c) return "";
  const table = c.table ? `<table class="adv"><tr>${c.table.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr><tr>${c.table.cells.map(x => `<td>${esc(x)}</td>`).join("")}</tr></table>` : "";
  const notes = c.notes.length ? `<dl>${c.notes.map(n => `<dt>${esc(n.name)}:</dt><dd> ${esc(n.text)}</dd>`).join("")}</dl>` : "";
  const tricks = c.tricks ? `<b>${esc(c.tricks.label)}</b><div class="tricks">${c.tricks.lines.map(() => "<div></div>").join("")}</div>` : "";
  return `<div class="comp"><div class="ch">${esc(c.title)}</div>${table}${notes}${tricks}<div class="cnotes"><b>Notes</b></div>${c.noteLines.map(() => "<div class=\"nline\"></div>").join("")}</div>`;
}
