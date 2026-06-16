'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Documentation lives as static HTML in public/docs/ (built from docs/onboarding/
 *  by scripts/build-onboarding-docs.ts). External hrefs open the rendered guides. */
const DOCUMENTATION = [
  { href: '/docs/what-this-is.html', label: 'Overview', icon: '✦' },
  { href: '/docs/user-guide.html', label: 'User Guide', icon: '◷' },
  { href: '/docs/scoring-and-tabs.html', label: 'Scoring & Tabs', icon: '▤' },
  { href: '/docs/analyst-playbook.html', label: 'Analyst Playbook', icon: '◇' },
  { href: '/docs/glossary.html', label: 'Glossary', icon: '✎' },
  { href: '/docs/data-and-provenance.html', label: 'Data & Provenance', icon: '▦' },
  { href: '/docs/admin-ops-runbook.html', label: 'Admin & Ops', icon: '⚙' },
];

const OBSERVE = [
  { href: '/crm/whats-new', label: "What's New", icon: '✦' },
  { href: '/crm/source-supporters', label: 'Supporters Sheet', icon: '📋' },
  { href: '/crm/source-hnw', label: 'HNW Sheet', icon: '📋' },
  { href: '/crm/seeds', label: 'Supporters (enriched)', icon: '★' },
  { href: '/crm/hnw-targets', label: 'HNW Targets (enriched)', icon: '◆' },
  { href: '/crm/enriched', label: 'Leads', icon: '◎' },
  { href: '/crm', label: 'All Entities', icon: '◉' },
  { href: '/crm/pipeline', label: 'Pipeline', icon: '▸' },
];

const ORIENT = [
  { href: '/crm/graph', label: 'Orbit', icon: '⊛' },
  { href: '/crm/graph/reach', label: 'Supporter Reach', icon: '◉' },
  { href: '/crm/orient/connectors', label: 'Key Connectors', icon: '◈' },
  { href: '/crm/orient/signals', label: 'Signal Landscape', icon: '◇' },
  { href: '/crm/orient/coverage', label: 'Evidence Coverage', icon: '▒' },
  { href: '/crm/orient/dimensions', label: 'Dimension Matrix', icon: '▦' },
  { href: '/crm/orient/brokerage', label: 'Institution Brokerage', icon: '⬡' },
  { href: '/crm/graph/institutions', label: 'Institutions', icon: '⬡' },
  { href: '/crm/graph/charities', label: 'Charities', icon: '♦' },
  { href: '/crm/introductions', label: 'Introduction Graph', icon: '⊙' },
  { href: '/crm/intro-routes', label: 'Introduction Routes', icon: '⇄' },
  { href: '/crm/orient/suggested-ties', label: 'Suggested Ties', icon: '⟿' },
  { href: '/crm/orient/communities', label: 'Communities', icon: '◍' },
];

const DECIDE = [
  { href: '/crm/decide', label: 'Lead Generator', icon: '⚡' },
  { href: '/crm/decide/by-connectivity', label: 'By Influence', icon: '↗' },
  { href: '/crm/decide/by-wealth', label: 'By Capacity', icon: '£' },
  { href: '/crm/decide/by-paths', label: 'By Introability', icon: '⇉' },
  { href: '/crm/decide/by-affinity', label: 'By Affinity', icon: '♥' },
];

const ACT = [
  { href: '/crm/act', label: 'Action Backlog', icon: '▶' },
  { href: '/crm/cohorts', label: 'Cohorts', icon: '⊞' },
  { href: '/crm/act/outcomes', label: 'Outcomes', icon: '✓' },
];

// Read-only analysis deployment: agent/pipeline operations consoles
// (Augment Queue, Review Queue, Admin) are intentionally not surfaced here.
const TOOLS = [
  { href: '/crm/identity', label: 'Identity QA' },
  { href: '/crm/review-queue', label: 'Needs Review' },
];

type Tab = { href: string; label: string; icon?: string };
type Section = { title: string; tabs: Tab[]; external?: boolean };

const SECTIONS: Section[] = [
  { title: 'Documentation', tabs: DOCUMENTATION, external: true },
  { title: 'Observe', tabs: OBSERVE },
  { title: 'Orient', tabs: ORIENT },
  { title: 'Decide', tabs: DECIDE },
  { title: 'Act', tabs: ACT },
  { title: 'Tools', tabs: TOOLS },
];

/** Only Decide is expanded on first load; the rest collapse to keep the rail short. */
const DEFAULT_OPEN: Record<string, boolean> = { Decide: true };

export function SidebarNav({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>(DEFAULT_OPEN);

  function isActive(href: string) {
    if (href === '/crm' || href === '/crm/graph' || href === '/crm/decide' || href === '/crm/act') return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  }

  function toggle(title: string) {
    setOpen(prev => ({ ...prev, [title]: !prev[title] }));
  }

  return (
    <nav className="w-56 shrink-0 border-r border-border-subtle bg-pitch-black flex flex-col h-full">
      <div className="p-4 border-b border-border-subtle">
        <Link href="/">
          <h1 className="text-sm font-semibold text-gold tracking-wider uppercase">Bloomsbury</h1>
          <p className="text-xs text-text-muted mt-0.5">Network Mapper</p>
        </Link>
      </div>

      <div className="flex-1 py-3 overflow-y-auto">
        {SECTIONS.map(section => {
          const isOpen = open[section.title] ?? false;
          // A section is highlighted while collapsed if the current page lives inside it.
          const hasActive = !section.external && section.tabs.some(t => isActive(t.href));
          return (
            <div key={section.title}>
              <button
                type="button"
                onClick={() => toggle(section.title)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between px-3 mt-4 mb-2 first:mt-0 group"
              >
                <span className={`text-[10px] font-semibold tracking-widest uppercase ${hasActive && !isOpen ? 'text-gold' : 'text-text-muted group-hover:text-text-secondary'}`}>
                  {section.title}
                </span>
                <span className={`text-[9px] mr-1 transition-transform ${isOpen ? 'rotate-90' : ''} ${hasActive && !isOpen ? 'text-gold' : 'text-text-muted'}`}>
                  ▸
                </span>
              </button>

              {isOpen && section.tabs.map(tab => {
                const active = !section.external && isActive(tab.href);
                const className = `flex items-center gap-2.5 px-4 py-1.5 text-[13px] transition-colors ${
                  active
                    ? 'bg-gold/10 text-gold border-r-2 border-gold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-deep-charcoal'
                }`;
                const inner = (
                  <>
                    {'icon' in tab && tab.icon && <span className="text-xs">{tab.icon}</span>}
                    {tab.label}
                  </>
                );
                // Documentation pages are static HTML outside the app router; open
                // them in a new tab with a plain anchor rather than a router Link.
                return section.external ? (
                  <a key={tab.href} href={tab.href} target="_blank" rel="noopener noreferrer" className={className}>
                    {inner}
                  </a>
                ) : (
                  <Link key={tab.href} href={tab.href} className={className}>
                    {inner}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-border-subtle space-y-2">
        {userEmail && (
          <p className="text-[11px] text-text-secondary truncate" title={userEmail}>
            {userEmail}
          </p>
        )}
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full text-left text-[11px] text-text-muted hover:text-gold transition-colors"
          >
            Sign out
          </button>
        </form>
        <p className="text-[10px] text-text-muted">BFF Intelligence Platform</p>
      </div>
    </nav>
  );
}
