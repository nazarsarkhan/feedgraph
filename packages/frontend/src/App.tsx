import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Layout } from '@/components/layout/Layout';
import { Toaster } from '@/components/ui/sonner';
import { ArticleDetailPage } from '@/pages/ArticleDetailPage';
import { ArticlesPage } from '@/pages/ArticlesPage';
import { ConfirmEmailPage } from '@/pages/ConfirmEmailPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DigestsPage } from '@/pages/DigestsPage';
import { EntitiesPage } from '@/pages/EntitiesPage';
import { EntityDetailPage } from '@/pages/EntityDetailPage';
import { FeedsPage } from '@/pages/FeedsPage';
import { GraphPage } from '@/pages/GraphPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TelemetryPage } from '@/pages/TelemetryPage';

export default function App() {
  return (
    <>
      <AppRoutes />
      <Toaster />
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/confirm" element={<ConfirmEmailPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/feeds" element={<FeedsPage />} />
          <Route path="/articles" element={<ArticlesPage />} />
          <Route path="/articles/:id" element={<ArticleDetailPage />} />
          <Route path="/entities" element={<EntitiesPage />} />
          <Route path="/entities/:id" element={<EntityDetailPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/digests" element={<DigestsPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/telemetry" element={<TelemetryPage />} />
          <Route path="/" element={<Navigate to="/articles" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
