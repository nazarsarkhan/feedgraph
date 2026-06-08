import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
} from 'react-router-dom';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Layout } from '@/components/layout/Layout';
import { Toaster } from '@/components/ui/sonner';
import { ArticleDetailPage } from '@/pages/ArticleDetailPage';
import { ArticlesPage } from '@/pages/ArticlesPage';
import { ConfirmEmailPage } from '@/pages/ConfirmEmailPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DigestsPage } from '@/pages/DigestsPage';
import { EntitiesPage } from '@/pages/EntitiesPage';
import { EntityArticlesPage } from '@/pages/EntityArticlesPage';
import { EntityDetailPage } from '@/pages/EntityDetailPage';
import { SimilarArticlesPage } from '@/pages/SimilarArticlesPage';
import { FeedsPage } from '@/pages/FeedsPage';
import { GraphPage } from '@/pages/GraphPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TelemetryPage } from '@/pages/TelemetryPage';

// Root element of the data router: renders the matched route via <Outlet />
// and mounts the app-wide <Toaster /> once. nuqs's react-router v6 adapter
// requires the data-router API (createBrowserRouter), so the route tree moved
// here from the old <Routes>/<Route> JSX that lived under <BrowserRouter>.
//
// NuqsAdapter is mounted HERE (inside the router, wrapping <Outlet />) rather
// than around RouterProvider, so its react-router hooks resolve to the data
// router's own history instance — without this, synchronous setter calls from
// event handlers (pagination, Clear-all) don't propagate to the URL.
function RootLayout() {
  return (
    <NuqsAdapter>
      <Outlet />
      <Toaster />
    </NuqsAdapter>
  );
}

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RootLayout />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/confirm" element={<ConfirmEmailPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/feeds" element={<FeedsPage />} />
          <Route path="/articles" element={<ArticlesPage />} />
          <Route path="/articles/:id" element={<ArticleDetailPage />} />
          <Route path="/articles/:id/similar" element={<SimilarArticlesPage />} />
          <Route path="/entities" element={<EntitiesPage />} />
          <Route path="/entities/:id" element={<EntityDetailPage />} />
          <Route path="/entities/:id/articles" element={<EntityArticlesPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/digests" element={<DigestsPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/telemetry" element={<TelemetryPage />} />
          <Route path="/" element={<Navigate to="/articles" replace />} />
        </Route>
      </Route>
    </Route>,
  ),
);
