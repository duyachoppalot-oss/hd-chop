// scripts/etl/lib/conditions.mjs
//
// Condition tags from one catalog row's text (description + used_on_raw).
// Wording from the 2026-10-23 survey (reports/explore_cond*.txt):
//
// Markets come as lists, mostly in parentheses: "(california, canada,
// domestic)", "(hdi, australia, england)", "(except japan)", "(cal. only)".
// Each list narrows which of two US markets the row covers:
//   domestic + california -> no tag        domestic only -> non_california
//   california only      -> california     neither       -> hdi
// "Domestic" is the 49-state market: catalogs list "(domestic, california)"
// side by side.
//
// Other tags only from qualifier pieces of the text (split on , ( ) and " - "),
// never from a part's own name: "HARNESS, main, non-abs" -> non_abs, but
// "ABS MODULE" and "CARBURETOR" get nothing. "9 spoke" is a cast-wheel style
// and "wire" is mostly electrical wire, so only "cast wheel(s)", "laced" and
// "wire/spoke(d) wheel(s)" count for wheels.

const MARKET = {
  domestic: 'domestic', '49 state': 'domestic', '49-state': 'domestic', us: 'domestic', usa: 'domestic',
  california: 'california', 'california-gj': 'california', cal: 'california', 'cal.': 'california', calif: 'california', 'calif.': 'california',
  canada: 'canada', hdi: 'hdi', hoi: 'hdi', 'hd!': 'hdi', hd4: 'hdi', international: 'hdi',
  japan: 'japan', jp2: 'japan', australia: 'australia', aus: 'australia', au2: 'australia',
  england: 'england', eng: 'england', en2: 'england', 'asia-pacific': 'asia', 'asia- pacific': 'asia', asean: 'asia',
  brazil: 'brazil', india: 'india', china: 'china', swiss: 'swiss', switzerland: 'swiss', mexico: 'mexico',
  korea: 'korea', taiwan: 'taiwan', europe: 'europe',
};

// Segment regexes per tag. Also written to condition_tags.patterns on --apply
// (with \b -> \y for Postgres).
export const TAG_PATTERNS = {
  abs: ['^(w/ ?|with )?abs( models| only)?$'],
  non_abs: ['^non[- ]?abs( models| only)?$', '^(w/o|without) abs$'],
  efi: ['^(w/ ?|with |on |for )?(efi|esfi|fuel[- ]injected)( models| vehicles| only)?$'],
  carb: ['^(w/ ?|with |on |for )?(carb|carbureted)( models| vehicles| only)?$'],
  cast_wheel: ['\\bcast wheels?\\b'],
  laced_wheel: ['\\blaced\\b', '\\b(wire|spoked?) wheels?\\b'],
};
const COMPILED = Object.entries(TAG_PATTERNS).map(([tag, ps]) => [tag, ps.map((p) => new RegExp(p, 'i'))]);

export const TAG_LABELS = {
  carb: 'Carbureted', efi: 'Fuel injected', abs: 'ABS', non_abs: 'Non-ABS',
  california: 'California', non_california: '49-state (not California)', hdi: 'International',
  cast_wheel: 'Cast wheels', laced_wheel: 'Laced wheels',
};
export const MARKET_PATTERNS = {
  california: ['\\bcalif(ornia)?\\b', '\\bcal\\.? only\\b'],
  non_california: ['\\bdomestic\\b', '\\b49[ -]state\\b'],
  hdi: ['\\bhdi\\b', '\\binternational\\b'],
};

// "(california, canada, domestic)" -> { except: false, markets: Set }; null if not a market list.
function parseMarketList(text) {
  let t = text.toLowerCase().replace(/\s+/g, ' ').trim();
  let except = false;
  const ex = /^(all except|except|excluding|all but) (.+)$/.exec(t);
  if (ex) { except = true; t = ex[2]; }
  t = t.replace(/\b(part )?only$/, '').replace(/\ball models$/, '').trim();
  const tokens = t.split(/,|&|\/|\band\b/).map((x) => x.trim()).filter(Boolean);
  if (!tokens.length) return null;
  const markets = new Set();
  for (const tok of tokens) {
    const m = MARKET[tok];
    if (!m) return null;
    markets.add(m);
  }
  return { except, markets };
}

// Returns { tags: Set, us: { dom, cal } | null, matched: [text pieces that set something] }.
export function rowConditions(description, usedOn) {
  const tags = new Set();
  const matched = [];
  let dom = true;
  let cal = true;
  let marketSeen = false;

  const text = `${description ?? ''}`;
  const groups = [...`${text} ${usedOn ?? ''}`.matchAll(/\(([^()]{2,80})\)/g)].map((m) => m[1]);
  // Unclosed trailing group, often cut mid-word: "(Australia, California, Canada, Domestic, In".
  const open = /\(([^()]{2,80})$/.exec(text);
  const openGroup = open ? open[1] : null;
  // Qualifier pieces outside parentheses, after the part name: "HARNESS, main, non-abs - fxst".
  const bare = text.replace(/\([^()]*\)/g, ' ').replace(/\([^()]*$/, ' ');
  const pieces = bare.split(/,|\s-\s/).slice(1).map((s) => s.trim()).filter(Boolean);

  const lists = [...groups, ...pieces];
  if (openGroup) lists.push(parseMarketList(openGroup) ? openGroup : openGroup.replace(/,[^,]*$/, ''));
  for (const g of lists) {
    const ml = parseMarketList(g);
    if (ml) {
      marketSeen = true;
      matched.push(g);
      const hasDom = ml.markets.has('domestic');
      const hasCal = ml.markets.has('california');
      if (ml.except) { dom &&= !hasDom; cal &&= !hasCal; }
      else { dom &&= hasDom; cal &&= hasCal; }
    }
  }
  for (const piece of [...new Set([...groups, ...pieces])]) {
    const p = piece.toLowerCase().replace(/\s+/g, ' ').trim();
    for (const [tag, res] of COMPILED) if (res.some((re) => re.test(p))) { tags.add(tag); matched.push(piece); }
  }
  return { tags, us: marketSeen ? { dom, cal } : null, matched };
}

export function marketTag({ dom, cal }) {
  if (dom && cal) return null;
  if (dom) return 'non_california';
  if (cal) return 'california';
  return 'hdi';
}

export const CONFLICTS = [['abs', 'non_abs'], ['efi', 'carb'], ['cast_wheel', 'laced_wheel']];
