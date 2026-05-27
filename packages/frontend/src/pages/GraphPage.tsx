import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function GraphPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Graph</CardTitle>
        <CardDescription>Navigable graph of articles, entities, categories.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Coming soon.</p>
      </CardContent>
    </Card>
  );
}
