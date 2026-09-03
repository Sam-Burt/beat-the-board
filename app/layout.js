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
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
