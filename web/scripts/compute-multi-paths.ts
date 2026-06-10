/**
 * Compute up to 3 distinct introduction paths from our supporters to every
 * reachable HNW target and high-value person (wealth_estimates or charity donor).
 *
 * Each path is scored on:
 *   - hops (fewer = better, weight 40%)
 *   - shared_orgs (more shared boards/charities = stronger bond, weight 25%)
 *   - introducer_connections (a well-connected introducer is more useful, weight 20%)
 *   - supporter_tier (Priority > Important > none, weight 15%)
 *
 * Paths are stored on attributes.intro_paths: IntroPath[]
 * Replaces the single-path attributes.introduction with richer data.
 *
 * Usage: npx tsx scripts/compute-multi-paths.ts [--dry-run]
 */
import fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupporter, isHnwTarget, seedInfo } from '../src/lib/crm/seed-reference';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

for (const line of (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split(/\r?\n/) : [])) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
function req(k: string): string { const v = process.env[k]; if (!v) throw new Error(`Missing env: ${k}`); return v; }

async function page(sb: DB, t: string, c: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []; let f = 0;
  for (;;) { const { data, error } = await sb.from(t).select(c).range(f, f + 999); if (error) throw new Error(`${t}: ${error.message}`); if (!data?.length) break; out.push(...(data as Record<string, unknown>[])); if (data.length < 1000) break; f += 1000; }
  return out;
}

interface IntroPath {
  rank: number;
  score: number;
  hops: number;
  path_names: string[];
  path_ids: string[];
  root_supporter: string;
  supporter_tier: string | null;
  supporter_sub_type: string | null;
  via_orgs: string[];
  score_breakdown: { hops: number; shared_orgs: number; introducer_reach: number; supporter_tier: number };
  reason: string;
}

function scorePath(
  hops: number,
  sharedOrgs: number,
  introducerDegree: number,
  supporterTier: string | null,
): { total: number; breakdown: { hops: number; shared_orgs: number; introducer_reach: number; supporter_tier: number } } {
  const hopScore = hops === 1 ? 1.0 : hops === 2 ? 0.5 : 0.2;
  const orgScore = Math.min(1.0, sharedOrgs / 3);
  const reachScore = Math.min(1.0, introducerDegree / 15);
  const tierScore = supporterTier === 'Priority / very important' ? 1.0 : supporterTier === 'Important' ? 0.6 : 0.2;

  const breakdown = {
    hops: Math.round(hopScore * 40),
    shared_orgs: Math.round(orgScore * 25),
    introducer_reach: Math.round(reachScore * 20),
    supporter_tier: Math.round(tierScore * 15),
  };
  return { total: breakdown.hops + breakdown.shared_orgs + breakdown.introducer_reach + breakdown.supporter_tier, breakdown };
}

function explainPath(p: IntroPath): string {
  const parts: string[] = [];
  if (p.hops === 1) parts.push('direct connection (1 hop)');
  else parts.push(`${p.hops}-hop path`);
  if (p.via_orgs.length) parts.push(`via ${p.via_orgs.slice(0, 2).join(' & ')}`);
  if (p.supporter_tier === 'Priority / very important') parts.push('priority supporter');
  else if (p.supporter_sub_type) parts.push(p.supporter_sub_type.toLowerCase());
  return parts.join('; ');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sb = createClient(req('SUPABASE_URL'), req('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'app' }, auth: { persistSession: false } });

  console.log('Loading data...');
  const ents = await page(sb, 'canonical_entities', 'canonical_entity_id, display_name, entity_type, attributes');
  const conns = await page(sb, 'network_connections', 'source_entity_id, connected_entity_id, connection_type, via_organisation');
  const coDirs = await page(sb, 'co_director_edges', 'seed_entity_id, co_director_entity_id, company_name');
  const wealthRows = await page(sb, 'wealth_estimates', 'entity_id');

  const nameOf = new Map(ents.map(e => [e.canonical_entity_id as string, e.display_name as string]));
  const typeOf = new Map(ents.map(e => [e.canonical_entity_id as string, e.entity_type as string]));
  const isPerson = (id: string) => typeOf.get(id) === 'person';
  const isCompany = (id: string) => typeOf.get(id) === 'company';
  const persons = ents.filter(e => e.entity_type === 'person');

  // Supporters = BFS roots
  const supporterIds = new Set(persons.filter(p => isSupporter(p.display_name as string)).map(p => p.canonical_entity_id as string));
  // Targets = HNW from spreadsheet + anyone with wealth data + charity-connected people
  const hnwIds = new Set(persons.filter(p => isHnwTarget(p.display_name as string)).map(p => p.canonical_entity_id as string));
  const wealthIds = new Set((wealthRows as Array<{ entity_id: string }>).map(w => w.entity_id));

  // Charity-connected people (co-trustees, directors of charity-like orgs)
  const charityPersonIds = new Set<string>();
  for (const c of conns) {
    const s = c.source_entity_id as string;
    const t = c.connected_entity_id as string | null;
    if (!t || !isPerson(s) || !isCompany(t)) continue;
    const orgName = nameOf.get(t) ?? '';
    if (/foundation|trust|charit/i.test(orgName)) charityPersonIds.add(s);
  }

  // All high-value targets: HNW + wealth-estimated + charity donors (minus supporters themselves)
  const targetIds = new Set<string>();
  for (const id of hnwIds) if (!supporterIds.has(id)) targetIds.add(id);
  for (const id of wealthIds) if (!supporterIds.has(id) && isPerson(id)) targetIds.add(id);
  for (const id of charityPersonIds) if (!supporterIds.has(id)) targetIds.add(id);

  console.log(`Supporters: ${supporterIds.size} | HNW targets: ${hnwIds.size} | Wealth-estimated: ${wealthIds.size} | Charity-connected: ${charityPersonIds.size}`);
  console.log(`Total unique targets (excl supporters): ${targetIds.size}`);

  // Build adjacency with via-org tracking and edge counts
  const adj = new Map<string, Map<string, { vias: Set<string>; weight: number }>>();
  const personDegree = new Map<string, number>();

  const link = (a: string, b: string, via?: string) => {
    if (!a || !b || a === b || !isPerson(a) || !isPerson(b)) return;
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!adj.has(x)) adj.set(x, new Map());
      const m = adj.get(x)!;
      if (!m.has(y)) m.set(y, { vias: new Set(), weight: 0 });
      const e = m.get(y)!;
      e.weight++;
      if (via) e.vias.add(via);
    }
  };

  // Direct person-person connections
  const companyMembers = new Map<string, Set<string>>();
  const personCompanies = new Map<string, Set<string>>();
  for (const c of conns) {
    const s = c.source_entity_id as string, t = c.connected_entity_id as string | null;
    if (!t) continue;
    if (isPerson(s) && isPerson(t)) {
      link(s, t, (c.via_organisation as string) ?? undefined);
    } else if (isPerson(s) && isCompany(t) && c.connection_type === 'DIRECTOR_OF') {
      if (!companyMembers.has(t)) companyMembers.set(t, new Set());
      companyMembers.get(t)!.add(s);
      if (!personCompanies.has(s)) personCompanies.set(s, new Set());
      personCompanies.get(s)!.add(t);
    }
  }
  for (const d of coDirs) {
    link(d.seed_entity_id as string, d.co_director_entity_id as string, (d.company_name as string) ?? undefined);
  }
  for (const [co, members] of companyMembers) {
    if (members.size < 2 || members.size > 40) continue;
    const arr = [...members], org = nameOf.get(co);
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) link(arr[i], arr[j], org);
  }

  // Compute person degree (number of unique neighbours)
  for (const [id, nbrs] of adj) personDegree.set(id, nbrs.size);

  // Shared orgs between two people
  const sharedOrgs = (a: string, b: string): string[] => {
    const edge = adj.get(a)?.get(b);
    return edge ? [...edge.vias] : [];
  };

  // Multi-path BFS: find up to 3 distinct paths per target
  // "Distinct" = different root supporter or different intermediate person
  console.log('Computing multi-paths...');

  // For each target, find all supporter→…→target paths up to 2 hops
  // We do a reverse BFS from each target (limited to 2 hops)
  // then collect all paths that start at a supporter

  const targetPaths = new Map<string, IntroPath[]>();
  let processed = 0;

  for (const targetId of targetIds) {
    // Reverse BFS from target, depth 2
    const paths: IntroPath[] = [];

    // 1-hop: supporter → target directly
    for (const [nb, edge] of adj.get(targetId) ?? []) {
      if (!supporterIds.has(nb)) continue;
      const si = seedInfo(nameOf.get(nb)!);
      const vias = [...edge.vias];
      const { total, breakdown } = scorePath(1, vias.length, personDegree.get(nb) ?? 0, si?.tier ?? null);
      paths.push({
        rank: 0, score: total, hops: 1,
        path_names: [nameOf.get(nb)!, nameOf.get(targetId)!],
        path_ids: [nb, targetId],
        root_supporter: nameOf.get(nb)!,
        supporter_tier: si?.tier ?? null,
        supporter_sub_type: si?.funder_sub_type ?? null,
        via_orgs: vias,
        score_breakdown: breakdown,
        reason: '',
      });
    }

    // 2-hop: supporter → intermediate → target
    for (const [mid, midEdge] of adj.get(targetId) ?? []) {
      if (!isPerson(mid) || supporterIds.has(mid)) continue; // intermediate can't be a supporter (those are 1-hop)
      for (const [nb, supEdge] of adj.get(mid) ?? []) {
        if (!supporterIds.has(nb)) continue;
        const si = seedInfo(nameOf.get(nb)!);
        const vias = [...new Set([...midEdge.vias, ...supEdge.vias])];
        const { total, breakdown } = scorePath(2, vias.length, personDegree.get(mid) ?? 0, si?.tier ?? null);
        paths.push({
          rank: 0, score: total, hops: 2,
          path_names: [nameOf.get(nb)!, nameOf.get(mid)!, nameOf.get(targetId)!],
          path_ids: [nb, mid, targetId],
          root_supporter: nameOf.get(nb)!,
          supporter_tier: si?.tier ?? null,
          supporter_sub_type: si?.funder_sub_type ?? null,
          via_orgs: vias,
          score_breakdown: breakdown,
          reason: '',
        });
      }
    }

    // Sort by score desc, then pick top 3 with distinct root supporters (prefer diversity)
    paths.sort((a, b) => b.score - a.score);
    const picked: IntroPath[] = [];
    const usedSupporters = new Set<string>();
    const usedIntermediates = new Set<string>();

    for (const p of paths) {
      if (picked.length >= 3) break;
      // Prefer diversity: different supporter, or at least different intermediate
      const midKey = p.path_ids.length === 3 ? p.path_ids[1] : '';
      if (picked.length > 0 && usedSupporters.has(p.path_ids[0]) && usedIntermediates.has(midKey)) continue;

      p.rank = picked.length + 1;
      p.reason = explainPath(p);
      picked.push(p);
      usedSupporters.add(p.path_ids[0]);
      if (midKey) usedIntermediates.add(midKey);
    }

    // If we still have fewer than 3, fill with remaining best
    if (picked.length < 3) {
      for (const p of paths) {
        if (picked.length >= 3) break;
        if (picked.some(q => q.path_ids[0] === p.path_ids[0] && q.path_ids.join('|') === p.path_ids.join('|'))) continue;
        p.rank = picked.length + 1;
        p.reason = explainPath(p);
        picked.push(p);
      }
    }

    if (picked.length > 0) targetPaths.set(targetId, picked);
    processed++;
    if (processed % 200 === 0) process.stdout.write(`  ${processed}/${targetIds.size}\r`);
  }

  console.log(`\nPaths computed for ${targetPaths.size} targets.`);

  // Stats
  let with1 = 0, with2 = 0, with3 = 0, hnwWith = 0;
  for (const [id, paths] of targetPaths) {
    if (paths.length >= 1) with1++;
    if (paths.length >= 2) with2++;
    if (paths.length >= 3) with3++;
    if (hnwIds.has(id)) hnwWith++;
  }
  console.log(`Targets with 1+ paths: ${with1} | 2+ paths: ${with2} | 3 paths: ${with3}`);
  console.log(`HNW targets with paths: ${hnwWith}/${hnwIds.size}`);

  // Write to DB
  if (dryRun) { console.log('[DRY RUN] nothing written.'); return; }

  const updates: { id: string; attrs: Record<string, unknown> }[] = [];
  for (const p of persons) {
    const id = p.canonical_entity_id as string;
    const attrs = { ...(p.attributes as Record<string, unknown> ?? {}) };
    const paths = targetPaths.get(id);

    if (paths) {
      attrs.intro_paths = paths;
      // Keep the best path as the primary introduction for backwards compatibility
      const best = paths[0];
      attrs.introduction = {
        degree: best.hops,
        introducer: best.path_names.length === 3 ? best.path_names[1] : undefined,
        via: best.via_orgs[0] ?? null,
        root_supporter: best.root_supporter,
        path: best.path_names,
        is_hnw_target: hnwIds.has(id) || undefined,
        is_supporter: false,
        computed_at: new Date().toISOString(),
      };
    } else if (supporterIds.has(id)) {
      // Supporter = degree 0
      delete attrs.intro_paths;
      attrs.introduction = { degree: 0, is_supporter: true, note: 'Supporter — in our core network', computed_at: new Date().toISOString() };
    } else {
      // Unreachable
      if (!attrs.introduction && !attrs.intro_paths) continue;
      delete attrs.intro_paths;
      delete attrs.introduction;
    }

    // Tag target category
    if (hnwIds.has(id)) attrs.target_category = 'hnw_target';
    else if (wealthIds.has(id) && !supporterIds.has(id)) attrs.target_category = 'wealth_identified';
    else if (charityPersonIds.has(id) && !supporterIds.has(id)) attrs.target_category = 'charity_donor';

    updates.push({ id, attrs });
  }

  console.log(`Writing ${updates.length} records...`);
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    const { error } = await sb.from('canonical_entities').update({ attributes: u.attrs }).eq('canonical_entity_id', u.id);
    if (error) console.log(`  ! ${nameOf.get(u.id)}: ${error.message}`);
    if (i % 300 === 0) process.stdout.write(`  ${i}/${updates.length}\r`);
  }
  console.log(`\nDone. Wrote multi-path introductions on ${updates.length} people.`);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
