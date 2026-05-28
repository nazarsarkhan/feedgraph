import { AxesSection } from '@/components/settings/AxesSection';
import { CategoriesSection } from '@/components/settings/CategoriesSection';
import { DeduplicateSection } from '@/components/settings/DeduplicateSection';
import { RegenerateSection } from '@/components/settings/RegenerateSection';

export function SettingsPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage classification categories, axes, entity deduplication, and reclassification.
        </p>
      </header>

      <CategoriesSection />
      <AxesSection />
      <DeduplicateSection />
      <RegenerateSection />
    </div>
  );
}
