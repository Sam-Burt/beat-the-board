import "./globals.css";

export const metadata = {
  title: "Beat The Board",
  description: "Player leaderboard — 1 point per person beaten.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
