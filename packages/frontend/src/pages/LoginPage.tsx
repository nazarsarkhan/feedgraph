import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
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
import { authApi, type LoginResponse, type RegisterResponse } from '@/lib/auth';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendDevUrl, setResendDevUrl] = useState<string | null>(null);

  const {
    register: field,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const login = useMutation<LoginResponse, ApiException, LoginForm>({
    mutationFn: authApi.login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate('/articles');
    },
  });

  const resend = useMutation<RegisterResponse, ApiException, { email: string }>({
    mutationFn: authApi.resendConfirmation,
    onSuccess: (data) => {
      setResendMessage('Confirmation email resent.');
      setResendDevUrl(data.devMode?.confirmationUrl ?? null);
    },
  });

  const onSubmit = handleSubmit((values) => {
    setResendMessage(null);
    setResendDevUrl(null);
    login.mutate(values);
  });

  const isEmailNotConfirmed = login.error?.body?.error === 'EMAIL_NOT_CONFIRMED';

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to FeedGraph</CardTitle>
          <CardDescription>Use your account credentials.</CardDescription>
        </CardHeader>

        <form onSubmit={onSubmit} noValidate>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...field('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...field('password')}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            {login.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <p>{login.error.message}</p>
                {isEmailNotConfirmed && (
                  <button
                    type="button"
                    disabled={resend.isPending}
                    className="mt-2 underline-offset-4 hover:underline disabled:opacity-50"
                    onClick={() => resend.mutate({ email: getValues('email') })}
                  >
                    {resend.isPending ? 'Resending…' : 'Resend confirmation email'}
                  </button>
                )}
              </div>
            )}

            {resendMessage && (
              <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="text-foreground">{resendMessage}</p>
                {resendDevUrl && (
                  <p className="break-all text-xs text-muted-foreground">
                    DEV MODE:{' '}
                    <a
                      href={resendDevUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {resendDevUrl}
                    </a>
                  </p>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </CardContent>

          <CardFooter className="flex flex-col items-start gap-1 text-sm text-muted-foreground">
            <p>
              No account?{' '}
              <Link to="/register" className="text-primary underline-offset-4 hover:underline">
                Create one
              </Link>
            </p>
            <p className="text-xs">
              Demo credentials: <code>demo@feedgraph.local</code> / <code>demo123456</code>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
