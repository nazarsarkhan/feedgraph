import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function FeedsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Feeds</CardTitle>
        <CardDescription>RSS sources you subscribe to.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Coming soon.</p>
      </CardContent>
    </Card>
  );
}
