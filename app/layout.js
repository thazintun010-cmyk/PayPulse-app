import "./globals.css";

export const metadata = {
  title: "PayPulse | Invoice Studio",
  description: "Create, download, and share freelancer invoices in Myanmar Kyat.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="my">
      <body>{children}</body>
    </html>
  );
}
