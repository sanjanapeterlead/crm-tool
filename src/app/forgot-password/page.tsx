import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/crm/auth/forgot-password-form";
import { BrandMark } from "@/components/crm/layout/brand-mark";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="bg-brand-wash flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-background px-4">
      <BrandMark orgName="Summit CRM" className="text-lg" />
      <Card className="w-full max-w-sm shadow-xl shadow-primary/5">
        <CardHeader>
          <CardTitle className="text-xl">Reset your password</CardTitle>
          <CardDescription>Enter your email and we&apos;ll send you a link to choose a new one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error === "expired" && (
            <Alert variant="destructive">
              <AlertDescription>That reset link is invalid or has expired. Request a new one below.</AlertDescription>
            </Alert>
          )}
          <ForgotPasswordForm />
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
