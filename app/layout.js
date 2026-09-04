import "./globals.css";

export const metadata = {
  title: "Beat The Board",
  description: "Player leaderboard — 1 point per person beaten.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Beat The Board",
  },
  icons: {
    apple: "/icons/icon-1.png",
  },
};

export const viewport = {
  themeColor: "#0b0b0b",
  width: "device-width",
  initialScale: 1,
  // Belt-and-braces alongside the 16px input font-size fix in globals.css:
  // that stops iOS Safari's auto-zoom at the source, this stops anyone from
  // pinch-zooming the app itself, which is what was leaving it stuck zoomed
  // in with a stray horizontal scrollbar. Trade-off: pinch-zoom is an
  // accessibility feature for low-vision users, so this is a deliberate
  // "always locked" choice for this app rather than a default anyone should
  // copy without thinking about it.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
