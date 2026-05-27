import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ArticlesPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Articles</CardTitle>
        <CardDescription>Filterable feed of ingested articles.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Coming soon.</p>
      </CardContent>
    </Card>
  );
}
