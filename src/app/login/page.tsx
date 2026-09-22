import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoginForm } from "@/components/crm/auth/login-form";
import { signupEnabled } from "@/lib/auth/signup-gate";
import { BrandMark } from "@/components/crm/layout/brand-mark";

// Read per request (SIGNUP_ENABLED), and it depends on the query string anyway.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; signedUp?: string; email?: string }>;
}) {
  const { redirectTo, signedUp, email } = await searchParams;

  return (
    <div className="bg-brand-wash flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-background px-4">
      <BrandMark orgName="Summit CRM" className="text-lg" />
      <Card className="w-full max-w-sm shadow-xl shadow-primary/5">
        <CardHeader>
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Sign in to manage your leads and pipeline.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {signedUp === "1" && (
            <Alert>
              <AlertDescription>Organization created. Sign in to get started.</AlertDescription>
            </Alert>
          )}
          <LoginForm redirectTo={redirectTo ?? "/"} defaultEmail={email ?? ""} />
          {signupEnabled() && (
            <p className="text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link href="/signup" className="text-primary hover:underline">
                Create an organization
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
