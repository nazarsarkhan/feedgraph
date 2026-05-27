import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function EntitiesPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entities</CardTitle>
        <CardDescription>People, companies, products, technologies.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Coming soon.</p>
      </CardContent>
    </Card>
  );
}
