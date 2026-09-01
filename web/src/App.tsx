import React from 'react';
import { UserProvider, useUser } from './userContext';
import { useHashRoute, useTheme, useToasts } from './hooks';
import { AuthScreen } from './pages/AuthScreen';
import { ChatPage } from './pages/ChatPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { AutomationsPage, MemoryPage, SettingsPage } from './pages/Panels';

const NAV: { path: string; label: string; section: string }[] = [
  { path: '/chat', label: 'Chat', section: 'Work' },
  { path: '/integrations', label: 'Integrations', section: 'Work' },
  { path: '/automations', label: 'Automations', section: 'Work' },
  { path: '/memory', label: 'Memory', section: 'System' },
  { path: '/settings', label: 'Settings', section: 'System' },
];

function Shell(): React.ReactElement {
  const { user, loading } = useUser();
  const [route, navigate] = useHashRoute();
  const [theme, toggleTheme] = useTheme();
  const { toasts } = useToasts();

  if (loading) {
    return <div className="empty">Loading CloudBrain…</div>;
  }
  if (!user) {
    return (
      <>
        <AuthScreen />
        <ToastRegion toasts={toasts} />
      </>
    );
  }

  const page = (() => {
    switch (route) {
      case '/integrations':
        return <IntegrationsPage />;
      case '/automations':
        return <AutomationsPage />;
      case '/memory':
        return <MemoryPage />;
      case '/settings':
        return <SettingsPage />;
      default:
        return <ChatPage />;
    }
  })();

  const sections = [...new Set(NAV.map((n) => n.section))];

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="brand">
          <span className="mark">CB</span> CloudBrain
        </div>
        {sections.map((section) => (
          <React.Fragment key={section}>
            <div className="nav-section">{section}</div>
            {NAV.filter((n) => n.section === section).map((n) => (
              <button
                key={n.path}
                className={`nav-item${route === n.path ? ' active' : ''}`}
                onClick={() => navigate(n.path)}
              >
                {n.label}
              </button>
            ))}
          </React.Fragment>
        ))}
        <div className="grow" />
        <button className="nav-item" onClick={() => void toggleTheme()} title="Toggle theme">
          {theme === 'dark' ? '☀ Light mode' : '☾ Dark mode'}
        </button>
        <div className="small muted" style={{ padding: '6px 8px' }}>
          {user.email}
        </div>
      </nav>

      <main className="main">
        <div className="page-header">
          <span className="page-title">{NAV.find((n) => n.path === route)?.label ?? 'Chat'}</span>
          <span className="badge plain small muted">Cloudflare Workers</span>
        </div>
        <div className="grow" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {page}
        </div>
      </main>

      <ToastRegion toasts={toasts} />
    </div>
  );
}

function ToastRegion({ toasts }: { toasts: { id: number; kind: string; message: string }[] }): React.ReactElement {
  return (
    <div className="toast-region">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <UserProvider>
      <Shell />
    </UserProvider>
  );
}
