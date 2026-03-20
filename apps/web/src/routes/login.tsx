import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

type ElectronSearchParams = {
  client_id?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
};

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): ElectronSearchParams => ({
    client_id:
      typeof search.client_id === "string" ? search.client_id : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    code_challenge:
      typeof search.code_challenge === "string"
        ? search.code_challenge
        : undefined,
    code_challenge_method:
      typeof search.code_challenge_method === "string"
        ? search.code_challenge_method
        : undefined,
  }),
});

function LoginPage(): React.ReactElement {
  const navigate = useNavigate();
  const searchParams: ElectronSearchParams = Route.useSearch();
  const isElectronFlow = searchParams.client_id === "electron";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [electronRedirectUrl, setElectronRedirectUrl] = useState<
    string | undefined
  >();

  // Build the query object to forward PKCE params to the sign-in API call
  const electronQuery = isElectronFlow
    ? (searchParams as Record<string, string>)
    : undefined;

  async function handleSubmit(
    e: React.SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
      fetchOptions: { query: electronQuery },
    });

    if (signInError) {
      setError(signInError.message ?? "Login failed. Please try again.");
      setLoading(false);
      return;
    }

    if (isElectronFlow) {
      authClient.ensureElectronRedirect();
      // eslint-disable-next-line unicorn/no-document-cookie -- reading electron auth cookie
      const cookieMatch = document.cookie.match(
        /better-auth\.electron=([^;]+)/,
      );
      const token = cookieMatch?.[1];
      if (token) {
        // eslint-disable-next-line unicorn/no-document-cookie -- clearing electron auth cookie
        document.cookie =
          "better-auth.electron=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
        setElectronRedirectUrl(`swanki://auth/callback#token=${token}`);
      } else {
        setError("Sign-in succeeded but desktop redirect failed.");
      }
      setLoading(false);
    } else {
      await navigate({ to: "/" });
    }
  }

  async function handleSocialLogin(
    provider: "google" | "github",
  ): Promise<void> {
    setError("");
    await authClient.signIn.social({
      provider,
      callbackURL: "/",
      fetchOptions: { query: electronQuery },
    });
  }

  if (electronRedirectUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              Sign-in successful!
            </CardTitle>
            <CardDescription>Returning to Swanki...</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <a href={electronRedirectUrl} className="text-primary underline">
              Click here if not redirected automatically
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Swanki</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">OR</span>
            <Separator className="flex-1" />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={async () => handleSocialLogin("google")}
            >
              Continue with Google
            </Button>
            <Button
              variant="outline"
              onClick={async () => handleSocialLogin("github")}
            >
              Continue with GitHub
            </Button>
          </div>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              to="/register"
              search={searchParams as Record<string, string>}
              className="text-primary underline"
            >
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
