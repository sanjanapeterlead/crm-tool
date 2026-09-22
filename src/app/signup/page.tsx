import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "@/components/crm/auth/signup-form";
import { signupEnabled } from "@/lib/auth/signup-gate";

// Read per request: SIGNUP_ENABLED must take effect without a rebuild.
export const dynamic = "force-dynamic";

export default function SignupPage() {
  const open = signupEnabled();

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{open ? "Create your organization" : "Sign-up is closed"}</CardTitle>
          <CardDescription>
            {open
              ? "You'll be the admin — invite your team once you're in."
              : "New organizations are created by invitation only. Ask your administrator to invite you, then sign in."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {open && <SignupForm />}
          <p className="text-center text-sm text-muted-foreground">
            {open ? "Already have an account? " : ""}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
