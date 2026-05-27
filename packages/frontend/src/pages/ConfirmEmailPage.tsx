import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ApiException } from '@/lib/api';
import { authApi } from '@/lib/auth';

export function ConfirmEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const confirm = useMutation<{ message: string }, ApiException, string>({
    mutationFn: authApi.confirm,
  });
  const { mutate: confirmMutate } = confirm;

  useEffect(() => {
    // mutate's identity is stable across renders per useMutation's contract,
    // so the effect re-runs only when the token from the URL changes.
    if (token) confirmMutate(token);
  }, [token, confirmMutate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Confirm your email</CardTitle>
          <CardDescription>
            {token ? 'Verifying your confirmation link…' : 'No token provided in the URL.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!token && (
            <p className="text-destructive">
              The link is missing a token. Open the confirmation URL again from your registration
              email.
            </p>
          )}
          {token && confirm.isPending && (
            <p className="text-muted-foreground">Confirming your email…</p>
          )}
          {token && confirm.isSuccess && (
            <p className="text-foreground">Email confirmed. You can now sign in.</p>
          )}
          {token && confirm.isError && <p className="text-destructive">{confirm.error.message}</p>}
        </CardContent>
        <CardFooter className="flex gap-3">
          <Button asChild>
            <Link to="/login">Go to login</Link>
          </Button>
          {token && confirm.isError && (
            <Link
              to="/login"
              className="self-center text-sm text-primary underline-offset-4 hover:underline"
            >
              Need a new link?
            </Link>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
