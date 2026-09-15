import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/crm/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Summit CRM</CardTitle>
          <CardDescription>Sign in to manage your leads and pipeline.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm redirectTo={redirectTo ?? "/"} />
        </CardContent>
      </Card>
    </div>
  );
}
