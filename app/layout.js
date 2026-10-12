import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata = {
  title: 'Cityport Hotel | Misafir Deneyimi',
  description: 'Cityport Hotel misafir deneyimi',
  applicationName: 'Cityport Hotel',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: 'https://cityporthotel.com/wp-content/uploads/2021/04/city-port-mini-1.png',
    apple: 'https://cityporthotel.com/wp-content/uploads/2021/04/city-port-mini-1.png'
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#193c49'
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        <link rel="stylesheet" href="/styles.css?v=guest-ui-17" />
      </head>
      <body>
        <a className="skip-link" href="#app">Ana içeriğe geç</a>
        {children}
        <Script
          src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js"
          strategy="beforeInteractive"
        />
        <Script src="/app.js" strategy="afterInteractive" />
        <Analytics />
      </body>
    </html>
  );
}
