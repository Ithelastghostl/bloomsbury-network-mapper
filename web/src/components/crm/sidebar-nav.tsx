'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
  { href: '/crm/orient/dimensions', label: 'Dimension Matrix', icon: '▦' },
  { href: '/crm/orient/brokerage', label: 'Institution Brokerage', icon: '⬡' },
  { href: '/crm/graph/institutions', label: 'Institutions', icon: '⬡' },
  { href: '/crm/graph/charities', label: 'Charities', icon: '♦' },
  { href: '/crm/introductions', label: 'Introduction Graph', icon: '⊙' },
  { href: '/crm/intro-routes', label: 'Introduction Routes', icon: '⇄' },
];

const DECIDE = [
  { href: '/crm/decide', label: 'Lead Generator', icon: '⚡' },
  { href: '/crm/decide/by-connectivity', label: 'By Connectivity', icon: '↗' },
  { href: '/crm/decide/by-wealth', label: 'By Network Worth', icon: '£' },
  { href: '/crm/decide/by-paths', label: 'By Intro Paths', icon: '⇉' },
  { href: '/crm/decide/by-affinity', label: 'By Donor Affinity', icon: '♥' },
];

const ACT = [
  { href: '/crm/act', label: 'Action Backlog', icon: '▶' },
  { href: '/crm/act/outcomes', label: 'Outcomes', icon: '✓' },
];

const TOOLS = [
  { href: '/crm/identity', label: 'Identity QA' },
  { href: '/crm/augment-queue', label: 'Augment Queue' },
  { href: '/review', label: 'Review Queue' },
  { href: '/admin', label: 'Admin' },
];

const SECTIONS = [
  { title: 'Observe', tabs: OBSERVE },
  { title: 'Orient', tabs: ORIENT },
  { title: 'Decide', tabs: DECIDE },
  { title: 'Act', tabs: ACT },
  { title: 'Tools', tabs: TOOLS },
];

export function SidebarNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/crm' || href === '/crm/graph' || href === '/crm/decide' || href === '/crm/act') return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
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
        {SECTIONS.map(section => (
          <div key={section.title}>
            <div className="px-3 mt-4 mb-2 first:mt-0">
              <span className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">{section.title}</span>
            </div>
            {section.tabs.map(tab => {
              const active = isActive(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center gap-2.5 px-4 py-1.5 text-[13px] transition-colors ${
                    active
                      ? 'bg-gold/10 text-gold border-r-2 border-gold'
                      : 'text-text-secondary hover:text-text-primary hover:bg-deep-charcoal'
                  }`}
                >
                  {'icon' in tab && <span className="text-xs">{(tab as { icon: string }).icon}</span>}
                  {tab.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-border-subtle">
        <p className="text-[10px] text-text-muted">BFF Intelligence Platform</p>
      </div>
    </nav>
  );
}
