/**
 * Build the onboarding docs into styled static HTML in public/docs/.
 *
 * The markdown in ../docs/onboarding/ is the single source of truth. This
 * renders each file to an HTML page that matches the existing guide house style
 * (public/guide-style.css: light theme, brand gold, `industry`/`Lato`). Re-run
 * after editing any onboarding markdown:
 *
 *   npx tsx web/scripts/build-onboarding-docs.ts
 *
 * No external markdown dependency: these docs use a known, small subset of
 * markdown (ATX headings, GFM pipe tables, `-` lists, fenced code blocks,
 * `>` blockquotes, **bold**, `code`, and [links](url)), so a focused converter
 * covers them exactly. If you start using a construct not handled here, add it.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, '..', '..', 'docs', 'onboarding');
const OUT_DIR = join(HERE, '..', 'public', 'docs');

/** Sidebar/switch order + the short label each doc gets in the cross-doc nav. */
const ORDER: Array<{ file: string; slug: string; nav: string }> = [
  { file: '00_WHAT_THIS_IS.md', slug: 'what-this-is', nav: 'Overview' },
  { file: '01_USER_GUIDE.md', slug: 'user-guide', nav: 'User guide' },
  { file: '02_SCORING_AND_TABS.md', slug: 'scoring-and-tabs', nav: 'Scoring & tabs' },
  { file: '03_ANALYST_PLAYBOOK.md', slug: 'analyst-playbook', nav: 'Playbook' },
  { file: '04_GLOSSARY.md', slug: 'glossary', nav: 'Glossary' },
  { file: '05_DATA_AND_PROVENANCE.md', slug: 'data-and-provenance', nav: 'Data & provenance' },
  { file: '06_ADMIN_OPS_RUNBOOK.md', slug: 'admin-ops-runbook', nav: 'Admin & ops' },
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Inline: code spans first (protected), then bold, then links. */
function inline(text: string): string {
  const codes: string[] = [];
  // Protect code spans behind a sentinel that can't occur in prose, so later
  // replacements never touch their contents and no stray number is mistaken
  // for a placeholder on restore.
  let s = text.replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `\u0000CODE${codes.length - 1}\u0000`;
  });
  s = escapeHtml(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => `<a href="${href}">${label}</a>`);
  s = s.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx) => codes[Number(idx)]);
  return s;
}

/** Convert one row of a GFM pipe table into cells (drops leading/trailing pipes). */
function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map(c => c.trim());
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      closeList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // Blockquote -> styled note (collect consecutive > lines)
    if (/^>\s?/.test(line)) {
      closeList();
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<div class="note">${inline(buf.join(' ').trim())}</div>`);
      continue;
    }

    // GFM table: a pipe line followed by a divider line
    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      closeList();
      const header = tableCells(line);
      i += 2; // header + divider
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(tableCells(lines[i]));
        i++;
      }
      const thead = `<thead><tr>${header.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      const text = inline(h[2].trim());
      if (level === 1) out.push(`<h1 class="doc-h1">${text}</h1>`);
      else out.push(`<h${level}>${text}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---\s*$/.test(line)) {
      closeList();
      out.push('<hr>');
      i++;
      continue;
    }

    // List items (- or 1.)
    const ul = line.match(/^\s*-\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const want: 'ul' | 'ol' = ul ? 'ul' : 'ol';
      if (listType && listType !== want) closeList();
      if (!listType) { out.push(`<${want}>`); listType = want; }
      out.push(`<li>${inline((ul ? ul[1] : ol![1]).trim())}</li>`);
      i++;
      continue;
    }

    // Blank line
    if (line.trim() === '') { closeList(); i++; continue; }

    // Paragraph
    closeList();
    out.push(`<p>${inline(line.trim())}</p>`);
    i++;
  }
  closeList();
  return out.join('\n');
}

function page(opts: { title: string; eyebrow: string; intro: string; switchNav: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)} — Bloomsbury Network Mapper</title>
<link rel="stylesheet" href="https://use.typekit.net/you7djq.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&family=Oswald:wght@400;600;700&display=swap">
<link rel="stylesheet" href="/guide-style.css">
<style>
  /* The doc H1 is rendered by the hero; in-body H1s (rare) read like section titles. */
  h1.doc-h1 { font-size: clamp(22px, 3.4vw, 30px); font-weight: 800; color: var(--black); margin: 40px 0 16px; }
  .doc-switch { flex-wrap: wrap; }
  .back-link { display: inline-block; margin: 0 0 14px; font-size: 13px; }
</style>
</head>
<body>

<header class="hero">
  <p class="eyebrow">${escapeHtml(opts.eyebrow)}</p>
  <h1>${escapeHtml(opts.title)}</h1>
  <p>${escapeHtml(opts.intro)}</p>
  <div class="meta">Bloomsbury Network Mapper · Onboarding & handoff</div>
</header>

<div class="wrap">
<main>
  <a class="back-link" href="/crm/decide">← Back to the app</a>
  <div class="guide-switch doc-switch">
    ${opts.switchNav}
  </div>

${opts.body}

</main>
</div>

<footer>
  Bloomsbury Football Foundation · Network Mapper · <a href="/docs/what-this-is.html">Documentation home</a>
</footer>

</body>
</html>
`;
}

/** Pull the first H1 as the title and the first paragraph after it as the intro. */
function extractTitleAndIntro(md: string): { title: string; intro: string; rest: string } {
  const lines = md.split('\n');
  let title = 'Documentation';
  let intro = '';
  let startIdx = 0;

  const h1Idx = lines.findIndex(l => /^#\s+/.test(l));
  if (h1Idx >= 0) {
    title = lines[h1Idx].replace(/^#\s+/, '').trim();
    // first non-empty, non-heading line after the H1 is the intro
    let j = h1Idx + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j < lines.length && !/^#/.test(lines[j]) && !lines[j].includes('|')) {
      intro = lines[j].replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
      startIdx = j + 1;
    } else {
      startIdx = h1Idx + 1;
    }
  }
  return { title, intro, rest: lines.slice(startIdx).join('\n') };
}

// ---- build ----
mkdirSync(OUT_DIR, { recursive: true });

const present = new Set(readdirSync(SRC_DIR).filter(f => f.endsWith('.md') && f !== 'README.md'));
const docs = ORDER.filter(d => present.has(d.file));
if (docs.length !== ORDER.length) {
  const missing = ORDER.filter(d => !present.has(d.file)).map(d => d.file);
  if (missing.length) console.warn(`! skipping missing: ${missing.join(', ')}`);
}

for (const doc of docs) {
  const md = readFileSync(join(SRC_DIR, doc.file), 'utf8');
  const { title, intro, rest } = extractTitleAndIntro(md);

  const switchNav = docs
    .map(d => `<a href="/docs/${d.slug}.html"${d.slug === doc.slug ? ' class="active"' : ''}>${escapeHtml(d.nav)}</a>`)
    .join('\n    ');

  const html = page({
    title,
    eyebrow: 'Bloomsbury Football Foundation',
    intro: intro || 'Onboarding and handoff documentation.',
    switchNav,
    body: renderMarkdown(rest),
  });

  const outPath = join(OUT_DIR, `${doc.slug}.html`);
  writeFileSync(outPath, html);
  console.log(`✓ ${doc.file} -> public/docs/${doc.slug}.html`);
}

console.log(`\nBuilt ${docs.length} doc pages into public/docs/.`);
