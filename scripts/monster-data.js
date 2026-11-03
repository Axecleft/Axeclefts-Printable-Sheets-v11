// Builds a Monster Manual-style stat block from a 3.5 SRD (D35E) actor (NPC or character).
// Reuses the character sheet data (totals, saves, skills, special abilities) and adds the
// stat-block lines: Hit Dice, Attack / Full Attack, Space/Reach, Special Attacks, ecology lines.
import { buildSheetData } from "./sheet-data.js";

const num = v => (typeof v === "number" ? v : Number(v) || 0);
const sign = v => (num(v) >= 0 ? `+${num(v)}` : `${num(v)}`);
const SIZE_ORDER = ["fine", "dim", "tiny", "sm", "med", "lg", "huge", "grg", "col"];
const SIZE_MOD = { fine: 8, dim: 4, tiny: 2, sm: 1, med: 0, lg: -1, huge: -2, grg: -4, col: -8 };
// [space, reach if tall, reach if long] (PHB/MM Table 8-4); humanoid-shaped creatures are tall
const SPACE = { fine: ["1/2 ft.", "0 ft.", "0 ft."], dim: ["1 ft.", "0 ft.", "0 ft."], tiny: ["2-1/2 ft.", "0 ft.", "0 ft."],
                sm: ["5 ft.", "5 ft.", "5 ft."], med: ["5 ft.", "5 ft.", "5 ft."], lg: ["10 ft.", "10 ft.", "5 ft."],
                huge: ["15 ft.", "15 ft.", "10 ft."], grg: ["20 ft.", "20 ft.", "15 ft."], col: ["30 ft.", "30 ft.", "20 ft."] };
const TALL_TYPES = /humanoid|giant|outsider|fey/i;
const SA_WORDS = /breath|gaze|poison|rend|trample|swallow|constrict|improved grab|grab|pounce|rake|sneak attack|smite|frightful|spell-like|energy drain|level drain|ability drain|blood drain|paraly|web|petrif|charm|summon|fear aura|stun|trip|engulf|create spawn|disease|curse|psionics|roar|howl|sonic/i;
const TYPE_NAMES = { aberration: "Aberration", animal: "Animal", construct: "Construct", dragon: "Dragon", elemental: "Elemental",
  fey: "Fey", giant: "Giant", humanoid: "Humanoid", magicalbeast: "Magical Beast", monstroushumanoid: "Monstrous Humanoid",
  ooze: "Ooze", outsider: "Outsider", plant: "Plant", undead: "Undead", vermin: "Vermin" };

// "sizeRoll(1, 8, @sizeDifference, @critMult)" -> "1d8"; plain dice pass through.
function diceOf(formula) {
  const f = String(formula ?? "");
  const m = f.match(/sizeRoll\(\s*(\d+)\s*,\s*(\d+)/);
  if (m) return `${m[1]}d${m[2]}`;
  const d = f.match(/\d+d\d+/);
  return d ? d[0] : f.replace(/@\w+(\.\w+)*/g, "").trim();
}

function cleanHTML(html) {
  return String(html ?? "")
    .replace(/@LinkedDescription\[[^\]]*\]/g, "")
    .replace(/@(UUID|Compendium|Item|Actor|JournalEntry)\[[^\]]*\]\{([^}]*)\}/g, "$2")
    .replace(/@(UUID|Compendium|Item|Actor|JournalEntry)\[([^\]]*)\]/g, (_, __, ref) => ref.split(".").pop())
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .trim();
}

const cap = t => String(t).replace(/^\w/, c => c.toUpperCase()).replace(/; or (\w)/, (_, c) => `; or ${c.toUpperCase()}`);

export function buildStatBlock(actor, opts = {}) {
  const d = buildSheetData(actor, opts);
  const s = actor.system ?? {};
  const at = s.attributes ?? {};
  const det = s.details ?? {};
  const items = actor.items ?? [];
  const byType = t => items.filter(i => i.type === t);
  const mod = k => num(s.abilities?.[k]?.mod);
  const sizeKey = s.traits?.actualSize || s.traits?.size || "med";
  const sizeMod = SIZE_MOD[sizeKey] ?? 0;
  const bab = num(at.bab?.total);
  const featNames = byType("feat").map(f => f.name.toLowerCase());
  const hasMultiattack = featNames.some(n => n.startsWith("multiattack") && !n.includes("improved"));
  const hasImpMulti = featNames.some(n => n.startsWith("improved multiattack"));

  // ---------- type line ----------
  const race = byType("race")[0];
  const rawType = race?.system?.creatureType || at.creatureType || "";
  const type = TYPE_NAMES[String(rawType).toLowerCase().replace(/\s/g, "")] || (rawType ? String(rawType).replace(/^\w/, c => c.toUpperCase()) : "");
  const subtypes = (race?.system?.subTypes ?? []).map(x => Array.isArray(x) ? x[0] : (x?.name ?? x)).filter(Boolean);
  const typeLine = `${d.size} ${type || race?.name || ""}${subtypes.length ? ` (${subtypes.join(", ")})` : ""}`.trim();

  // ---------- Hit Dice ----------
  const dice = {};
  let totalHD = 0;
  for (const c of byType("class")) {
    const lv = num(c.system?.levels), die = num(c.system?.hd);
    if (!lv || !die) continue;
    dice[die] = (dice[die] ?? 0) + lv; totalHD += lv;
  }
  const conLess = s.abilities?.con?.total === 0 || s.abilities?.con?.isZero || /undead|construct/i.test(type);
  const conBonus = conLess ? 0 : mod("con") * totalHD;
  const diceStr = Object.entries(dice).sort((a, b) => b[0] - a[0]).map(([die, n]) => `${n}d${die}`).join(" plus ");
  const hitDice = diceStr ? `${diceStr}${conBonus ? (conBonus > 0 ? `+${conBonus}` : conBonus) : ""} (${d.hp.max} hp)` : `${d.hp.max} hp`;

  // ---------- speed ----------
  const sp = at.speed ?? {};
  const sq = ft => `${ft} ft. (${Math.floor(ft / 5)} squares)`;
  const speedParts = [sq(num(sp.land?.total))];
  for (const k of ["burrow", "climb", "fly", "swim"]) {
    const ft = num(sp[k]?.total);
    if (!ft) continue;
    const man = k === "fly" ? (sp.fly?.maneuverability ?? sp.fly?.maneuver ?? "") : "";
    speedParts.push(`${k} ${ft} ft.${man ? ` (${man})` : ""}`);
  }

  // ---------- armor class ----------
  const ac = d.ac;
  const acParts = [];
  if (ac.size) acParts.push(`${sign(ac.size)} size`);
  if (ac.dex) acParts.push(`${sign(ac.dex)} Dex`);
  if (ac.natural) acParts.push(`${sign(ac.natural)} natural`);
  for (const p of d.protection) acParts.push(`${p.bonus} ${p.name.toLowerCase()}`);
  if (ac.misc) acParts.push(`${sign(ac.misc)} other`);
  const acLine = `${ac.total}${acParts.length ? ` (${acParts.join(", ")})` : ""}, touch ${ac.touch}, flat-footed ${ac.flatFooted}`;

  // ---------- attacks ----------
  const attackItems = byType("attack");
  const weaponAttacks = [];
  const naturalAttacks = [];
  for (const a of attackItems) {
    const sy = a.system ?? {};
    const ranged = sy.actionType === "rwak" || sy.actionType === "rsak";
    const ablKey = sy.ability?.attack || (ranged ? "dex" : "str");
    const natural = sy.attackType === "natural";
    const primary = natural ? sy.primaryAttack !== false : true;
    let bonus = bab + mod(ablKey) + sizeMod + (Number.isFinite(Number(sy.attackBonus)) ? num(sy.attackBonus) : 0) + num(sy.enh);
    const base = (sy.baseWeaponType || a.name).toLowerCase();
    if (featNames.some(n => n.startsWith("weapon focus") && n.includes(base))) bonus++;
    if (natural && !primary) bonus -= hasMultiattack || hasImpMulti ? 2 : 5;
    const dmgKey = sy.ability?.damage || (ranged ? "" : "str");
    let mult = num(sy.ability?.damageMult) || 1;
    if (natural && !primary && !hasImpMulti) mult = 0.5;
    const dmgMod = dmgKey ? Math.floor(mod(dmgKey) * mult) : 0;
    const parts = sy.damage?.parts ?? [];
    const first = parts[0];
    const dmg = first ? `${diceOf(Array.isArray(first) ? first[0] : first?.formula)}${dmgMod ? sign(dmgMod) : ""}` : "";
    const extra = parts.slice(1).map(p => {
      const f = Array.isArray(p) ? p : [p?.formula, p?.type];
      return `${diceOf(f[0])} ${f[1] ?? ""}`.trim();
    }).filter(Boolean);
    const cr = num(sy.ability?.critRange) || 20, cm = num(sy.ability?.critMult) || 2;
    const crit = cr < 20 || cm !== 2 ? `/${cr < 20 ? `${cr}-20` : ""}${cm !== 2 ? `${cr < 20 ? "/" : ""}x${cm}` : ""}` : "";
    const entry = { name: a.name.toLowerCase(), bonus, ranged, natural, primary,
                    damage: `${dmg}${crit}${extra.length ? ` plus ${extra.join(" plus ")}` : ""}` };
    (natural ? naturalAttacks : weaponAttacks).push(entry);
  }
  // fall back to equipped weapons when the actor has no attack items
  if (!attackItems.length) {
    for (const w of d.weapons) {
      weaponAttacks.push({ name: w.name.toLowerCase(), bonus: num(w.attack), ranged: w.range !== "-", natural: false, primary: true,
                           damage: `${w.damage}${w.critical !== "x2" ? `/${w.critical}` : ""}` });
    }
  }
  const one = a => `${a.name} ${sign(a.bonus)} ${a.ranged ? "ranged" : "melee"}${a.damage ? ` (${a.damage})` : ""}`;
  const iterative = a => {
    const bonuses = [a.bonus];
    for (let b = bab - 5, i = a.bonus - 5; b > 0 && bonuses.length < 4; b -= 5, i -= 5) bonuses.push(i);
    return `${a.name} ${bonuses.map(sign).join("/")} ${a.ranged ? "ranged" : "melee"}${a.damage ? ` (${a.damage})` : ""}`;
  };
  const primaryWeapon = weaponAttacks.find(a => !a.ranged) ?? weaponAttacks[0];
  const attackLine = primaryWeapon ? one(primaryWeapon) : naturalAttacks[0] ? one(naturalAttacks[0]) : "-";
  const groupNatural = list => {
    const byName = {};
    for (const a of list) (byName[`${a.name}|${a.bonus}|${a.damage}`] ??= { ...a, count: 0 }).count++;
    return Object.values(byName).map(a => `${a.count > 1 ? `${a.count} ${a.name}s` : a.name} ${sign(a.bonus)} melee${a.damage ? ` (${a.damage})` : ""}`);
  };
  const fullParts = [];
  if (primaryWeapon) fullParts.push(iterative(primaryWeapon));
  fullParts.push(...groupNatural(primaryWeapon ? naturalAttacks.map(a => ({ ...a, bonus: a.primary ? a.bonus - 5 : a.bonus })) : naturalAttacks));
  const rangedWeapon = weaponAttacks.find(a => a.ranged && a !== primaryWeapon);
  const fullAttackLine = fullParts.join(" and ") + (rangedWeapon ? `; or ${iterative(rangedWeapon)}` : "") || "-";

  // ---------- space / reach ----------
  const [space, tallReach, longReach] = SPACE[sizeKey] ?? SPACE.med;
  const reach0 = TALL_TYPES.test(type) || !type ? tallReach : longReach;
  const reach = s.traits?.reach ? `${s.traits.reach} ft.`.replace(/ ft\. ft\./, " ft.") : reach0;

  // ---------- special attacks / qualities ----------
  const racialGroup = d.featureRows;
  const allFeatures = racialGroup.filter(r => !r.header).map(r => r.name);
  const specialAttacks = allFeatures.filter(n => SA_WORDS.test(n));
  if (d.spellbooks.some(b => /spell-like/i.test(b.name)) && !specialAttacks.some(n => /spell-like/i.test(n))) specialAttacks.push("Spell-like abilities");
  if (d.spellbooks.some(b => !/spell-like/i.test(b.name))) specialAttacks.push("Spells");
  const specialQualities = allFeatures.filter(n => !SA_WORDS.test(n));

  // ---------- skills, feats ----------
  const skills = d.skills.filter(k => k.rank || num(k.misc) !== 0 && k.misc !== "+0" && !k.acp)
    .map(k => `${k.name} ${k.total}`);
  // ---------- ecology (D35E keeps some of these in details; blank lines are left to fill in) ----------
  const pick = (...keys) => { for (const k of keys) { const v = det[k]; if (v && typeof v !== "object") return v; if (v?.value) return v.value; } return ""; };
  const cr = num(det.totalCr) > 0 ? det.totalCr : det.cr;
  const crText = cr === undefined || cr === "" ? "" : (num(cr) > 0 && num(cr) < 1 ? `1/${Math.round(1 / num(cr))}` : `${num(cr)}`);

  return {
    ...d,
    typeLine, hitDice,
    initiative: d.init.total,
    speedLine: speedParts.join(", "),
    acLine,
    babGrapple: `${sign(bab)}/${d.grapple.total}`,
    attackLine: cap(attackLine), fullAttackLine: cap(fullAttackLine),
    spaceReach: `${space}/${reach}`,
    specialAttacks: specialAttacks.join(", ") || "-",
    specialQualities: specialQualities.join(", ") || "-",
    savesLine: `Fort ${d.saves[0].total}, Ref ${d.saves[1].total}, Will ${d.saves[2].total}`,
    abilitiesLine: d.abilities.map(a => `${a.abbr[0]}${a.abbr.slice(1).toLowerCase()} ${conLess && a.key === "con" ? "-" : a.score}`).join(", "),
    skillsLine: skills.join(", ") || "-",
    featsLine: d.feats.join(", ") || "-",
    languagesLine: d.languages.join(", ") || "-",
    environment: pick("environment", "climate", "terrain"),
    organization: pick("organization"),
    cr: crText,
    treasure: pick("treasure"),
    alignmentLine: d.alignment,
    advancement: pick("advancement"),
    levelAdjustment: pick("levelAdjustment", "la"),
    description: cleanHTML(det.biography?.value ?? det.biography ?? ""),
    notes: cleanHTML(det.notes?.value ?? "")
  };
}
