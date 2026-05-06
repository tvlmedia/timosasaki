import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Timo Sasaki Lens Lab",
  description: "Prototype. Print. Test. Tune."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-labBg text-labText">{children}</body>
    </html>
  );
}
