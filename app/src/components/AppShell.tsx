import type { ReactNode } from 'react';
import './AppShell.css';

interface Props {
  children: ReactNode;
}

const NAV_ITEMS = [
  { label: 'Pipeline', active: true },
  { label: 'Sponsors', active: false },
  { label: 'Network', active: false },
  { label: 'Triggers', active: false },
];

export function AppShell({ children }: Props) {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__brand">
          <span className="app-shell__brand-name">Bloomsbury</span>
          <span className="app-shell__brand-sub">Network Mapper</span>
        </div>

        <nav className="app-shell__nav" aria-label="Primary">
          {NAV_ITEMS.map(item => (
            <button
              key={item.label}
              className={`app-shell__nav-item${item.active ? ' app-shell__nav-item--active' : ''}`}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="app-shell__sidebar-footer">
          <button className="app-shell__nav-item">Settings</button>
        </div>
      </aside>

      <main className="app-shell__main">
        <header className="app-shell__topbar">
          <h1 className="app-shell__page-title">Pipeline</h1>
          <button className="app-shell__add-btn">Add sponsor</button>
        </header>
        <div className="app-shell__content">
          {children}
        </div>
      </main>
    </div>
  );
}
