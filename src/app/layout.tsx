import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ACCENT_COOKIE, parseAccent } from "@/lib/theme/accents";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Summit CRM",
  description: "A simple, focused CRM for small sales teams.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read server-side so the chosen accent is in the first paint.
  const accent = parseAccent((await cookies()).get(ACCENT_COOKIE)?.value);

  return (
    <html
      lang="en"
      data-accent={accent}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
