import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Verde Agrotech | Field Intel",
  description:
    "Field data capture & analytics platform for Agricultural Specialist Sales Representatives.",
  icons: { icon: "/logo-mark.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="min-h-screen bg-canvas font-sans text-ink">
        {children}
      </body>
    </html>
  );
}
