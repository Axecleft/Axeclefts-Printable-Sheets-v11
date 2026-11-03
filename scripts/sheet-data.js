// Builds the data object the printable sheet templates use, from a 3.5 SRD (D35E) actor.
// Works on actor.toObject(false) inside Foundry, or on an exported actor JSON file for testing.
// Values the system already calculates (totals, modifiers, AC, saves, skills) are read directly;
// only per-weapon attack and damage lines are worked out here.

const SKILL_NAMES = {
  apr: "Appraise", blc: "Balance", blf: "Bluff", clm: "Climb", coc: "Concentration", crf: "Craft",
  dsc: "Decipher Script", dip: "Diplomacy", dev: "Disable Device", dis: "Disguise", esc: "Escape Artist",
  fog: "Forgery", gif: "Gather Information", han: "Handle Animal", hea: "Heal", hid: "Hide",
  int: "Intimidate", jmp: "Jump", kar: "Knowledge (Arcana)", kdu: "Knowledge (Dungeoneering)",
  ken: "Knowledge (Engineering)", kge: "Knowledge (Geography)", khi: "Knowledge (History)",
  klo: "Knowledge (Local)", kna: "Knowledge (Nature)", kno: "Knowledge (Nobility)",
  kpl: "Knowledge (The Planes)", kre: "Knowledge (Religion)", kps: "Knowledge (Psionics)",
  lis: "Listen", mos: "Move Silently", opl: "Open Lock", prf: "Perform", pro: "Profession", rid: "Ride",
  src: "Search", sen: "Sense Motive", slt: "Sleight of Hand", spk: "Speak Language", spl: "Spellcraft",
  spt: "Spot", sur: "Survival", swm: "Swim", tmb: "Tumble", umd: "Use Magic Device", uro: "Use Rope",
  aut: "Autohypnosis", psi: "Psicraft", upd: "Use Psionic Device"
};
const PSIONIC_SKILLS = new Set(["kps", "aut", "psi", "upd"]);
const HIDDEN_SKILLS = new Set(["spk"]);
const ABILITIES = [["str", "STR", "Strength"], ["dex", "DEX", "Dexterity"], ["con", "CON", "Constitution"],
                   ["int", "INT", "Intelligence"], ["wis", "WIS", "Wisdom"], ["cha", "CHA", "Charisma"]];
const SIZES = { fine: ["Fine", 8, -16], dim: ["Diminutive", 4, -12], tiny: ["Tiny", 2, -8], sm: ["Small", 1, -4],
                med: ["Medium", 0, 0], lg: ["Large", -1, 4], huge: ["Huge", -2, 8], grg: ["Gargantuan", -4, 12],
                col: ["Colossal", -8, 16] };
const INVENTORY_TYPES = new Set(["weapon", "equipment", "loot", "consumable", "container"]);

const num = v => (typeof v === "number" ? v : Number(v) || 0);
const sign = v => (num(v) >= 0 ? `+${num(v)}` : `${num(v)}`);
const blank = v => (v === null || v === undefined || v === "" ? "" : v);

// ---------- classic layout: spell lists laid out in three balanced columns ----------
// Heights are counted in list lines (14px). Each box costs its title plus border and gap (~1.7 lines).
// A level longer than its column is split, and the next part is titled "Level N (continued)".
// Full pages are filled column by column; the last page's columns are balanced.
// The list uses the room under the slots table only when that saves a page; otherwise it starts on a fresh page.
// Capacities are set for Letter (the shorter page), so A4 fits too.
const SPELL_COLS = 3, BOX = 1.7, FIRST_PAGE_LINES = 44, PAGE_LINES = 66, MIN_PART = 4, MIN_START = 8;
function layColumns(queue, caps) {
  const height = q => q.reduce((t, b) => t + b.lines.length + BOX, 0);
  const pages = [];
  for (let i = 0; queue.length; i++) {
    const cap = caps(i), total = height(queue);
    // last page: aim for equal columns (continued parts add a title each); otherwise fill each column
    const target = total <= cap * SPELL_COLS - BOX * 2
      ? Math.min(cap, Math.ceil((total + BOX * (SPELL_COLS - 1)) / SPELL_COLS)) : cap;
    const cols = [];
    for (let c = 0; c < SPELL_COLS; c++) {
      const limit = c === SPELL_COLS - 1 ? cap : target;
      const col = []; let used = 0;
      while (queue.length) {
        const b = queue[0], h = b.lines.length + BOX;
        // a whole level fits, or overshoots the balance target by a line or two but still fits the page
        if (used + h <= limit || (used + h <= cap && used + h <= limit + 2)) { col.push(queue.shift()); used += h; continue; }
        const room = Math.floor(limit - used - BOX);
        // no tiny pieces: a level only starts at a column's foot with room for a few lines, and leaves enough to carry on
        if (room >= (b.cont ? MIN_PART : MIN_START) && b.lines.length - room >= MIN_PART) {
          col.push({ level: b.level, cont: b.cont, lines: b.lines.slice(0, room) });
          queue[0] = { level: b.level, cont: true, lines: b.lines.slice(room) };
        }
        break;
      }
      if (!col.length && queue.length && c === 0) {   // nothing fitted a whole column: force a part so the loop advances
        const b = queue[0], room = Math.floor(cap - BOX);
        col.push({ level: b.level, cont: b.cont, lines: b.lines.slice(0, room) });
        if (b.lines.length > room) queue[0] = { level: b.level, cont: true, lines: b.lines.slice(room) }; else queue.shift();
      }
      cols.push(col);
    }
    pages.push({ columns: cols.filter(c => c.length) });
  }
  return pages;
}
export function spellColumns(levels) {
  const blocks = () => levels.map(l => ({ level: l.level, cont: false,
    lines: [...l.spells, { blank: true }, { blank: true }] }));
  const under = layColumns(blocks(), i => (i ? PAGE_LINES : FIRST_PAGE_LINES));
  const fresh = layColumns(blocks(), () => PAGE_LINES);
  // starting on a fresh page costs the table page; take it when it uses no more paper
  if (fresh.length + 1 <= under.length) return [{ first: true, columns: [] }, ...fresh];
  return under.map((p, i) => ({ ...p, first: i === 0 }));
}

export function buildSheetData(actor, { skillNames = {}, sizeNames = {}, showPsionicSkills = null } = {}) {
  const s = actor.system ?? {};
  const at = s.attributes ?? {};
  const det = s.details ?? {};
  const items = actor.items ?? [];
  const byType = t => items.filter(i => i.type === t);

  // ---------- identity ----------
  // Classes with levels (a casting class Adventurers and Minions keeps at level 0 for a gestalt character isn't one);
  // a gestalt class shows its two classes at its level: "Wizard 7 // Cleric 7"
  const classes = byType("class").filter(c => num(c.system?.levels) > 0).map(c => {
    const levels = num(c.system?.levels);
    const g = c.flags?.["axeclefts-aam2"]?.gestalt?.classes;
    const parts = Array.isArray(g) && g.length === 2 ? g.map(x => x?.name).filter(Boolean) : null;
    return { name: c.name, levels, line: parts?.length === 2 ? parts.map(n => `${n} ${levels}`).join(" // ") : `${c.name} ${levels}` };
  });
  const race = byType("race")[0];
  const sizeKey = s.traits?.actualSize || s.traits?.size || "med";
  const [sizeLabel, sizeAC, sizeGrapple] = SIZES[sizeKey] ?? SIZES.med;
  const xp = det.xp ?? {};

  // ---------- abilities ----------
  const abilities = ABILITIES.map(([key, abbr, label]) => {
    const a = s.abilities?.[key] ?? {};
    const temp = num(a.total) !== num(a.origTotal ?? a.total);
    return { key, abbr, label, score: blank(a.total), mod: sign(a.mod),
             tempScore: temp ? a.total : "", tempMod: temp ? sign(a.mod) : "",
             base: blank(a.value) };
  });
  const mod = k => num(s.abilities?.[k]?.mod);

  // ---------- armor class breakdown ----------
  const equipped = items.filter(i => i.type === "equipment" && i.system?.equipped);
  const armorItems = equipped.filter(i => i.system?.equipmentType === "armor");
  const shieldItems = equipped.filter(i => i.system?.equipmentType === "shield");
  const armorBonus = armorItems.reduce((t, i) => t + num(i.system.armor?.value) + num(i.system.armor?.enh), 0);
  const shieldBonus = shieldItems.reduce((t, i) => t + num(i.system.armor?.value) + num(i.system.armor?.enh), 0);
  const maxDex = at.maxDex?.total;
  const dexToAC = maxDex !== null && maxDex !== undefined && maxDex !== "" ? Math.min(mod("dex"), num(maxDex)) : mod("dex");
  const natural = num(at.naturalACTotal);
  const acTotal = num(at.ac?.normal?.total);
  const acMisc = acTotal - 10 - armorBonus - shieldBonus - dexToAC - sizeAC - natural;
  const ac = { total: acTotal, touch: num(at.ac?.touch?.total), flatFooted: num(at.ac?.flatFooted?.total),
               armor: armorBonus, shield: shieldBonus, dex: dexToAC, size: sizeAC, natural, misc: acMisc };

  // ---------- saves, initiative, attacks ----------
  const saveRow = (key, label, abil) => {
    const sv = at.savingThrows?.[key] ?? {};
    const base = num(sv.base), am = mod(abil), total = num(sv.total);
    return { label, ability: abil.toUpperCase(), total: sign(total), base: sign(base), mod: sign(am), misc: sign(total - base - am) };
  };
  const saves = [saveRow("fort", "Fortitude", "con"), saveRow("ref", "Reflex", "dex"), saveRow("will", "Will", "wis")];
  const initTotal = num(at.init?.total);
  const init = { total: sign(initTotal), dex: sign(mod("dex")), misc: sign(initTotal - mod("dex")) };
  const bab = num(at.bab?.total);
  const atk = at.attack ?? {};
  const melee = bab + mod("str") + sizeAC + num(atk.general) + num(atk.melee);
  const ranged = bab + mod("dex") + sizeAC + num(atk.general) + num(atk.ranged);
  const grappleMisc = num(at.cmb?.total) - bab - mod("str") - sizeGrapple;
  const attackRows = [
    { label: "Melee", total: sign(melee), bab: sign(bab), ability: sign(mod("str")), size: sign(sizeAC), misc: sign(num(atk.general) + num(atk.melee)) },
    { label: "Ranged", total: sign(ranged), bab: sign(bab), ability: sign(mod("dex")), size: sign(sizeAC), misc: sign(num(atk.general) + num(atk.ranged)) },
    { label: "Grapple", total: sign(at.cmb?.total), bab: sign(bab), ability: sign(mod("str")), size: sign(sizeGrapple), misc: sign(grappleMisc) }
  ];

  // ---------- weapons ----------
  const featNames = byType("feat").map(f => f.name.toLowerCase());
  const weapons = byType("weapon").filter(w => w.system?.equipped !== false).map(w => {
    const sy = w.system ?? {}, wd = sy.weaponData ?? {};
    const isRanged = !!(wd.range && num(wd.range)) || (sy.weaponSubtype === "ranged");
    const enh = num(sy.enh);
    const base = (sy.baseWeaponType || w.name).toLowerCase();
    let focus = 0;
    if (featNames.some(n => n.startsWith("weapon focus") && n.includes(base))) focus++;
    if (featNames.some(n => n.startsWith("greater weapon focus") && n.includes(base))) focus++;
    const atkTotal = (isRanged ? ranged : melee) + Math.max(enh, sy.masterwork ? 1 : 0) + focus;
    const strDmg = isRanged ? 0 : Math.floor(mod("str") * (sy.weaponSubtype === "2h" ? 1.5 : 1));
    let spec = 0;
    if (featNames.some(n => n.startsWith("weapon specialization") && n.includes(base))) spec += 2;
    if (featNames.some(n => n.startsWith("greater weapon specialization") && n.includes(base))) spec += 2;
    const dmgBonus = enh + strDmg + spec;
    const cr = num(wd.critRange) || 20;
    return {
      name: w.name, attack: sign(atkTotal),
      damage: `${wd.damageRoll || "-"}${dmgBonus ? sign(dmgBonus) : ""}`,
      critical: `${cr < 20 ? `${cr}-20/` : ""}x${wd.critMult || 2}`,
      range: wd.range ? `${wd.range} ft.` : "-", weight: `${num(sy.weight)} lb.`,
      type: wd.damageType || "", size: (SIZES[wd.size] ?? SIZES.med)[0],
      special: [sy.masterwork && !enh ? "Masterwork" : "", enh ? `+${enh}` : ""].filter(Boolean).join(", ")
    };
  });

  // ---------- armor & shields ----------
  const protection = [...armorItems, ...shieldItems].map(i => {
    const sy = i.system ?? {}, ar = sy.armor ?? {};
    return { name: i.name, kind: sy.equipmentType === "shield" ? "Shield" : "Armor",
             type: (sy.equipmentSubtype || "").replace(/Armor|Shield/, "").replace(/^\w/, c => c.toUpperCase()),
             bonus: sign(num(ar.value) + num(ar.enh)), maxDex: blank(ar.dex) === "" ? "-" : sign(ar.dex),
             checkPenalty: ar.acp ? `-${num(ar.acp)}` : "0", spellFailure: `${num(sy.spellFailure)}%`,
             speed: "", weight: `${num(sy.weight)} lb.` };
  });

  // ---------- skills ----------
  const anyPsionic = showPsionicSkills ?? Object.entries(s.skills ?? {}).some(([k, v]) => PSIONIC_SKILLS.has(k) && num(v.rank) > 0);
  const skills = [];
  for (const [key, sk] of Object.entries(s.skills ?? {})) {
    if (HIDDEN_SKILLS.has(key) || sk.visibility === "hidden") continue;
    if (PSIONIC_SKILLS.has(key) && !anyPsionic) continue;
    const pushRow = (label, v) => {
      const rank = num(v.rank), total = num(v.mod), am = num(v.abilityModifier ?? mod(v.ability));
      skills.push({ name: label, classSkill: !!v.cs, trainedOnly: !!v.rt, acp: !!v.acp,
                    ability: (v.ability || "").toUpperCase(), total: sign(total), rank: rank || "",
                    abilityMod: sign(am), misc: sign(total - rank - am),
                    untrainedNoUse: !!v.rt && rank === 0 });
    };
    const label = skillNames[key] || SKILL_NAMES[key] || key;
    if (sk.subSkills && Object.keys(sk.subSkills).length) {
      for (const sub of Object.values(sk.subSkills)) pushRow(`${label} (${sub.name || "?"})`, sub);
    } else pushRow(label, sk);
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  const maxRanks = num(at.hd?.total) + 3;

  // ---------- equipment, money, load ----------
  const gear = items.filter(i => INVENTORY_TYPES.has(i.type)).map(i => ({
    name: i.name, qty: num(i.system?.quantity) || 1,
    cost: num(i.system?.price) ? `${num(i.system.price)} gp` : "",
    weight: num(i.system?.weight) ? `${(num(i.system.weight) * (num(i.system?.quantity) || 1))} lb.` : ""
  }));
  const half = Math.ceil(gear.length / 2);
  const enc = at.encumbrance ?? {};
  const lv = enc.levels ?? {};
  const cur = s.currency ?? {};

  // ---------- feats, class & racial features, languages ----------
  const feats = byType("feat").filter(f => (f.system?.featType ?? "feat") === "feat").map(f => f.name).sort();
  // Special abilities: every feature item that is not a plain feat, grouped by where it comes from,
  // plus racial traits the system keeps on the actor itself (senses, resistances, immunities...).
  const featureItems = byType("feat").filter(f => (f.system?.featType ?? "feat") !== "feat");
  const isRacial = f => ["racial", "race", "racialAbility"].includes(f.system?.featType)
    || /^race/i.test(f.system?.source ?? "") || f.system?.classSource === race?.name;
  const racialNames = featureItems.filter(isRacial).map(f => f.name);
  const classNames = featureItems.filter(f => !isRacial(f)).map(f => f.name);
  for (const a of race?.system?.addedAbilities ?? []) {
    const n = a?.name ?? a?.label; if (n && !racialNames.includes(n)) racialNames.push(n);
  }
  const traits = [];
  const sn = { ...(at.senses ?? {}), ...(s.senses ?? {}) };
  if (num(sn.darkvision)) traits.push(`Darkvision ${num(sn.darkvision)} ft.`);
  if (sn.lowLight) traits.push(`Low-light vision${num(sn.lowLightMultiplier) > 2 ? ` (x${num(sn.lowLightMultiplier)})` : ""}`);
  for (const [k, l] of [["blindsight", "Blindsight"], ["blindsense", "Blindsense"], ["tremorsense", "Tremorsense"], ["truesight", "True seeing"]])
    if (num(sn[k])) traits.push(`${l} ${num(sn[k])} ft.`);
  if (sn.special) traits.push(String(sn.special));
  if (s.traits?.senses) traits.push(String(s.traits.senses));
  const listText = v => Array.isArray(v) ? v.map(x => Array.isArray(x) ? x.filter(y => typeof y !== "boolean").join(" ") : (x?.name ?? x?.label ?? x)).join(", ") : v;
  const dr = s.traits?.dr || (s.combinedDR?.length ? listText(s.combinedDR) : "");
  if (dr) traits.push(`Damage reduction ${dr}`);
  const eres = s.traits?.eres || (s.combinedResistances?.length ? listText(s.combinedResistances) : "");
  if (eres) traits.push(`Resistance ${eres}`);
  if (s.traits?.cres) traits.push(`Condition resistance ${s.traits.cres}`);
  const imm = (o) => [...(o?.value ?? []), ...(o?.custom ? String(o.custom).split(/[;,]/) : [])].map(x => String(x).trim()).filter(Boolean);
  if (imm(s.traits?.di).length) traits.push(`Immune: ${imm(s.traits.di).join(", ")}`);
  if (imm(s.traits?.ci).length) traits.push(`Immune (conditions): ${imm(s.traits.ci).join(", ")}`);
  if (imm(s.traits?.dv).length) traits.push(`Vulnerable: ${imm(s.traits.dv).join(", ")}`);
  if (num(at.sr?.total)) traits.push(`Spell resistance ${num(at.sr.total)}`);
  if (num(s.traits?.fastHealing)) traits.push(`Fast healing ${num(s.traits.fastHealing)}`);
  if (num(s.traits?.regen) || num(s.traits?.regenTotal)) traits.push(`Regeneration ${num(s.traits.regenTotal) || num(s.traits.regen)}`);
  const uniq = arr => [...new Set(arr)];
  const featureGroups = [
    { label: race?.name ? `${race.name} (racial)` : "Racial", list: uniq([...traits, ...racialNames.sort()]) },
    { label: classes.length ? classes.map(c => c.name).join(" / ") : "Class", list: uniq(classNames.sort()) }
  ].filter(g => g.list.length);
  const features = featureGroups.flatMap(g => g.list);
  const featureRows = featureGroups.flatMap(g => [{ name: g.label, header: true }, ...g.list.map(name => ({ name }))]);
  const lang = s.traits?.languages ?? {};
  const languages = [...(lang.value ?? []), ...(lang.custom ? String(lang.custom).split(/[;,]/) : [])]
    .map(l => String(l).trim()).filter(Boolean).map(l => l.charAt(0).toUpperCase() + l.slice(1));

  // ---------- spellcasting (one block per spellbook that has a caster level or spells) ----------
  const spellItems = byType("spell");
  const books = Object.entries(at.spells?.spellbooks ?? {}).filter(([key, b]) =>
      key !== "spelllike" ? (num(b.cl?.total) > 0 || spellItems.some(sp => (sp.system?.spellbook ?? "primary") === key))
                          : spellItems.some(sp => sp.system?.spellbook === key));
  const spellbooks = books.map(([key, b]) => {
    const abl = b.ability || "int";
    const levels = Array.from({ length: 10 }, (_, lvl) => {
      const sl = b.spells?.[`spell${lvl}`] ?? {};
      const list = spellItems.filter(sp => (sp.system?.spellbook ?? "primary") === key && num(sp.system?.level) === lvl)
        .map(sp => ({ name: sp.name, school: sp.system?.school ?? "", prepared: num(sp.system?.preparation?.preparedAmount) || "",
                     domain: !!(sp.system?.domain || sp.system?.isDomain || sp.system?.preparation?.domain) }))
        .sort((a, b2) => a.name.localeCompare(b2.name));
      return { level: lvl, perDay: num(sl.max) || (lvl === 0 && num(sl.base) ? num(sl.base) : ""),
               known: num(sl.maxKnown) || num(sl.known) || "", bonus: num(sl.bonus) || "",
               dc: 10 + lvl + mod(abl), spells: list,
               used: num(sl.max) > 0 || list.length > 0 };
    });
    // Psionics (D35E spends power points from the spellbook): powers known by level, power points instead of slots
    const psionic = !!b.usePowerPoints || String(b.spellcastingType ?? "").toLowerCase() === "psionic";
    if (psionic) for (const l of levels) { l.known = l.spells.length || ""; l.perDay = ""; l.bonus = ""; l.used = l.spells.length > 0; l.ppCost = Math.max(1, 2 * l.level - 1); }
    const activeLevels = levels.filter(l => l.used);
    // The class's own name ("Wizard spells"), found by the tag the spellbook keeps ("wizard")
    const tagOf = n => String(n || "").replace(/[^a-zA-Z0-9\s]/g, "").split(/\s+/).map((w, i) => (i ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join("");
    const owner = b.class ? byType("class").find(c => tagOf(c.system?.customTag || c.name) === b.class) : null;
    const powerCount = psionic ? levels.reduce((n, l) => n + l.spells.length, 0) : 0;
    const maxPower = psionic ? Math.max(num(b.powersMaxLevel), ...levels.filter(l => l.spells.length).map(l => l.level), 0) : 0;
    return { name: b.class ? `${owner?.name ?? b.class} ${psionic ? "powers" : "spells"}` : (key === "spelllike" ? "Spell-like Abilities" : `${b.name || key} ${psionic ? "powers" : "spells"}`),
             psionic, powerPoints: psionic ? num(b.powerPointsTotal) : 0, powersKnown: powerCount, maxPowerLevel: maxPower,
             psiLevels: psionic ? levels.filter(l => l.level >= 1 && l.level <= Math.max(1, maxPower)) : [],
             casterLevel: num(b.cl?.total), ability: abl.toUpperCase(), abilityMod: sign(mod(abl)),
             spontaneous: !!b.spontaneous, concentration: num(b.concentration) ? sign(b.concentration) : "",
             levels, activeLevels, hasKnown: levels.some(l => l.known),
             spellPages: spellColumns(activeLevels) };
  });

  // ---------- fixed-size blocks for the classic layout (blank ones are for writing in) ----------
  // pad short lists with blank lines to n; long lists keep every entry (weapon/armor blocks are capped)
  const pad = (arr, n, cap = false) => [...(cap ? arr.slice(0, n) : arr), ...Array.from({ length: Math.max(0, n - arr.length) }, () => ({ blank: true }))];

  const speed = at.speed ?? {};
  const otherSpeeds = ["fly", "swim", "climb", "burrow"].filter(k => num(speed[k]?.total))
    .map(k => `${k} ${speed[k].total} ft.`).join(", ");

  return {
    name: actor.name, img: actor.img,
    classLine: classes.map(c => c.line).join(" / "),
    race: race?.name ?? "", alignment: det.alignmentLabel || det.alignment || "", deity: det.deity || "",
    level: det.level?.value ?? "", size: sizeNames[sizeKey] || sizeLabel, age: det.age || "", gender: det.gender || "",
    height: det.height || "", weight: det.weight || "",
    xp: num(xp.value), xpNext: num(xp.max),
    abilities, hp: { max: num(at.hp?.max), current: num(at.hp?.value), temp: blank(at.hp?.temp), nonlethal: blank(at.hp?.nonlethal) },
    ac, saves, init, bab: sign(bab), speed: `${num(speed.land?.total)} ft.`, otherSpeeds,
    attackRows, grapple: attackRows[2], weapons, protection,
    sr: num(at.sr?.total) || "", dr: s.traits?.dr || "",
    acp: num(at.acp?.total) ? `-${num(at.acp.total)}` : "0",
    spellFailure: num(at.arcaneSpellFailure) || [...armorItems, ...shieldItems].reduce((t, i) => t + num(i.system?.spellFailure), 0),
    skills, maxRanks, maxCrossRanks: maxRanks / 2,
    gearLeft: gear.slice(0, half), gearRight: gear.slice(half),
    carried: num(enc.carriedWeight), loads: { light: num(lv.light), medium: num(lv.medium), heavy: num(lv.heavy) },
    money: { pp: num(cur.pp), gp: num(cur.gp), sp: num(cur.sp), cp: num(cur.cp) },
    feats, features, languages,
    noteLines: Array.from({ length: 18 }),
    lifts: { overHead: num(lv.heavy), offGround: num(lv.carry) || num(lv.heavy) * 2, drag: num(lv.drag) || num(lv.heavy) * 5 },
    weaponBlocks: pad(weapons, 4), protectionBlocks: pad(protection, 4),
    featLines: pad(feats.map(name => ({ name })), 14), featureLines: pad(featureRows, 14), featureRows,
    languageLines: pad(languages.map(name => ({ name })), 6),
    gearLines: pad(gear, 28),
    spellbooks, isCaster: spellbooks.length > 0,
    printedOn: new Date().toLocaleDateString()
  };
}
