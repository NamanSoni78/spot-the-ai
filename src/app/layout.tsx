import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Real or AI? — Spot the synthetic",
  description:
    "One image or text is real, the other is AI-generated. Can you spot the fake before the clock runs out? A guessing game built for the Pollinations quest, with real photographs from Wikimedia Commons.",
  keywords: [
    "real or AI",
    "spot the fake",
    "AI detection game",
    "Pollinations",
    "Wikimedia Commons",
    "guessing game",
  ],
  openGraph: {
    title: "Real or AI? — Spot the synthetic",
    description:
      "One is real, one is AI-generated. Spot the fake before the timer runs out.",
    siteName: "Real or AI?",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Real or AI? — Spot the synthetic",
    description:
      "One is real, one is AI-generated. Spot the fake before the timer runs out.",
  },
};

export const viewport: Viewport = {
  themeColor: "#131120",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${display.variable} ${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
