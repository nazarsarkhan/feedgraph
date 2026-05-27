import { NavLink, Outlet } from 'react-router-dom';
import { FileText, Network, Rss, Settings, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { to: '/articles', label: 'Articles', icon: FileText },
  { to: '/feeds', label: 'Feeds', icon: Rss },
  { to: '/entities', label: 'Entities', icon: Tag },
  { to: '/graph', label: 'Graph', icon: Network },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <div className="text-lg font-semibold tracking-tight">FeedGraph</div>
        <div className="text-sm text-muted-foreground">demo@feedgraph.local</div>
      </header>

      <div className="flex">
        <aside className="w-56 border-r min-h-[calc(100vh-3.5rem)] px-3 py-4">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
