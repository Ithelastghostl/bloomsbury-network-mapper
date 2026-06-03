'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const CRM_TABS = [
  { href: '/crm/seeds', label: 'Seeds', icon: '★' },
  { href: '/crm/enriched', label: 'Leads', icon: '◎' },
  { href: '/crm', label: 'All', icon: '◉' },
  { href: '/crm/pipeline', label: 'Pipeline', icon: '▸' },
];

const GRAPH_TABS = [
  { href: '/crm/graph', label: 'Orbit', icon: '⊛' },
  { href: '/crm/graph/institutions', label: 'Institutions', icon: '⬡' },
  { href: '/crm/graph/charities', label: 'Charities', icon: '♦' },
];

const TOOLS = [
  { href: '/crm/augment-queue', label: 'Augment Queue' },
  { href: '/review', label: 'Review Queue' },
  { href: '/admin', label: 'Admin' },
];

export function SidebarNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    // Exact-match routes that are prefixes of sibling routes.
    if (href === '/crm' || href === '/crm/graph') return pathname === href;
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
        <div className="px-3 mb-2">
          <span className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">CRM</span>
        </div>
        {CRM_TABS.map(tab => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                active
                  ? 'bg-gold/10 text-gold border-r-2 border-gold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-deep-charcoal'
              }`}
            >
              <span className="text-xs">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}

        <div className="px-3 mt-6 mb-2">
          <span className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">Social Graph</span>
        </div>
        {GRAPH_TABS.map(tab => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                active
                  ? 'bg-gold/10 text-gold border-r-2 border-gold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-deep-charcoal'
              }`}
            >
              <span className="text-xs">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}

        <div className="px-3 mt-6 mb-2">
          <span className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">Tools</span>
        </div>
        {TOOLS.map(tool => (
          <Link
            key={tool.href}
            href={tool.href}
            className="flex items-center gap-2.5 px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-deep-charcoal transition-colors"
          >
            {tool.label}
          </Link>
        ))}
      </div>

      <div className="p-4 border-t border-border-subtle">
        <p className="text-[10px] text-text-muted">BFF Intelligence Platform</p>
      </div>
    </nav>
  );
}
