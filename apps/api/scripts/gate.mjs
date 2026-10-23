// Phase 2 gate (docs/ROADMAP.md): the five gate words on five test bikes across
// Touring / Softail / Dyna / Sportster, through the HTTP API.
// Usage: node scripts/gate.mjs [base_url]   (default http://localhost:3001)
const BASE = process.argv[2] ?? 'http://localhost:3001';
const BIKES = [
  [2004, 'FLHR'], // Touring, Road King
  [2010, 'FLHX'], // Touring, Street Glide
  [2005, 'FLSTC'], // Softail, Heritage Classic
  [2004, 'FXDL'], // Dyna, Low Rider
  [2004, 'XL883'], // Sportster
];
const WORDS = ['gas tank', 'blinkers', 'bags', 'kickstand', 'speedo'];

const get = async (path) => {
  const r = await fetch(BASE + path);
  return { status: r.status, body: await r.json() };
};

const years = await get('/v1/years');
console.log(`/v1/years: ${years.status}, ${years.body.years.length} years (${years.body.years.at(-1)}-${years.body.years[0]})`);
const models = await get('/v1/models?year=2004');
console.log(`/v1/models?year=2004: ${models.status}, ${models.body.models.length} models, ${models.body.models.filter((m) => m.has_parts).length} with parts`);

for (const [year, model] of BIKES) {
  console.log(`\n${year} ${model}`);
  for (const q of WORDS) {
    const { status, body } = await get(`/v1/search?year=${year}&model=${model}&q=${encodeURIComponent(q)}`);
    if (status !== 200) { console.log(`  ${q.padEnd(10)} HTTP ${status} ${body.error}`); continue; }
    const r = body.results[0];
    const concept = body.concepts.map((c) => `${c.display_name}[${c.match}]`).join(', ') || 'no concept';
    const parts = r?.parts ?? body.fallback ?? [];
    const show = parts.slice(0, 4).map((p) => {
      const own = p.spans.filter((s) => s.model_code === model).map((s) => (s.year_end > s.year_start ? `${s.year_start}-${s.year_end}` : `${s.year_start}`));
      return `${p.oem}${p.conditions.length ? `{${p.conditions.join(',')}}` : ''} ${own.join(',')}`;
    });
    console.log(`  ${q.padEnd(10)} -> ${concept.padEnd(24)} ${String(parts.length).padStart(2)} part(s)  ${show.join(' | ')}${parts.length > 4 ? ' …' : ''}`);
  }
}

const part = await get('/v1/part/68140-99');
console.log(`\n/v1/part/68140-99: ${part.status}, root ${part.body.oem} (${part.body.concept}), chain ${part.body.chain.map((c) => c.oem).join(' ')}, ${part.body.fits.reduce((n, f) => n + f.spans.length, 0)} spans`);
const bad = await get('/v1/search?year=2004&model=FLHR&q=');
const miss = await get('/v1/search?year=2004&model=FLHR&q=sprocket%20cover');
console.log(`empty q: ${bad.status}; unknown words "sprocket cover": concepts ${miss.body.concepts.length}, fallback ${miss.body.fallback?.length ?? 0} part(s): ${(miss.body.fallback ?? []).slice(0, 3).map((p) => `${p.oem} ${p.description}`).join(' | ')}`);
