import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart2,
  BookOpen,
  FileText,
  LayoutDashboard,
  LogOut,
  Network,
  Rss,
  Settings,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMe } from '@/hooks/useMe';
import { authApi } from '@/lib/auth';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { to: '/articles', label: 'Articles', icon: FileText },
  { to: '/feeds', label: 'Feeds', icon: Rss },
  { to: '/entities', label: 'Entities', icon: Tag },
  { to: '/graph', label: 'Graph', icon: Network },
  { to: '/digests', label: 'Digests', icon: BookOpen },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/telemetry', label: 'Telemetry', icon: BarChart2 },
];

export function Layout() {
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const logout = useMutation({
    mutationFn: authApi.logout,
    onSuccess: async () => {
      // Order matters:
      // 1. setQueryData(null) — immediate UI update (header email vanishes)
      // 2. invalidateQueries — ensures any stale cached copies are dropped
      // 3. navigate — leaves the protected tree last, with state already clean
      queryClient.setQueryData(['me'], null);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate('/login');
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background px-6">
        <div className="text-lg font-semibold tracking-tight">FeedGraph</div>
        <div className="flex items-center gap-3">
          {me.data && <span className="text-sm text-muted-foreground">{me.data.email}</span>}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Log out"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
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
