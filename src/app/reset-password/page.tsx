import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "@/components/crm/auth/reset-password-form";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/crm/layout/brand-mark";

export default async function ResetPasswordPage() {
  // Only reachable with the short-lived session the emailed link created.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=expired");

  return (
    <div className="bg-brand-wash flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-background px-4">
      <BrandMark orgName="Summit CRM" className="text-lg" />
      <Card className="w-full max-w-sm shadow-xl shadow-primary/5">
        <CardHeader>
          <CardTitle className="text-xl">Choose a new password</CardTitle>
          <CardDescription>Signed in as {user.email}.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
