import "./globals.css";

export const metadata = {
  title: "PayPulse | Invoice Studio",
  description: "Create, download, and share freelancer invoices in Myanmar Kyat.",
  verification: {
    google: "cQNLwcHa9f2QSJ6Jf9u9qZJd4AN4jO8PESpjn-qoqbc",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="my">
      <body>{children}</body>
    </html>
  );
}
