import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiException } from '@/lib/api';
import { authApi, type RegisterResponse } from '@/lib/auth';

const COPY_FEEDBACK_MS = 1500;

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mismatchError, setMismatchError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const register = useMutation<RegisterResponse, ApiException, { email: string; password: string }>(
    {
      mutationFn: authApi.register,
    },
  );

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setMismatchError(null);
    if (password !== confirmPassword) {
      setMismatchError('Passwords do not match.');
      return;
    }
    register.mutate({ email, password });
  };

  const onCopy = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard API requires a secure context; ignore silently — the
      // user can still click the link or copy by hand from the URL field.
    }
  };

  const succeeded = register.isSuccess;
  const devUrl = register.data?.devMode?.confirmationUrl ?? null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        {succeeded ? (
          <>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Confirmation required</CardTitle>
                <span className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  DEV MODE
                </span>
              </div>
              <CardDescription>
                In production this link would arrive by email. For this development environment,
                click it directly to confirm your account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {devUrl ? (
                <>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <a
                      href={devUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-sm text-primary underline-offset-4 hover:underline"
                    >
                      {devUrl}
                    </a>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onCopy(devUrl)}
                    aria-live="polite"
                  >
                    {copied ? 'Copied!' : 'Copy URL'}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Account created. Check your email for a confirmation link.
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Link to="/login" className="text-sm text-primary underline-offset-4 hover:underline">
                Go to login
              </Link>
            </CardFooter>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Create an account</CardTitle>
              <CardDescription>You will receive an email confirmation link.</CardDescription>
            </CardHeader>
            <form onSubmit={onSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                {(mismatchError || register.error) && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {mismatchError ?? register.error?.message}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={register.isPending}>
                  {register.isPending ? 'Creating account…' : 'Create account'}
                </Button>
              </CardContent>
              <CardFooter className="text-sm text-muted-foreground">
                <p>
                  Already have an account?{' '}
                  <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                    Sign in
                  </Link>
                </p>
              </CardFooter>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
