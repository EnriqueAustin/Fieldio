import type { Metadata } from 'next';
import type { Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from '../components/ui/toaster';
import { PwaLifecycle } from '../components/offline/pwa-lifecycle';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Fieldio',
    description: 'Field Service Management',
    applicationName: 'Fieldio',
    manifest: '/manifest.json',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'Fieldio',
    },
    icons: {
        icon: [
            { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
            { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        ],
        apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    formatDetection: { telephone: false },
};

export const viewport: Viewport = {
    themeColor: '#0f172a',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <Providers>
                    {children}
                    <Toaster />
                    <PwaLifecycle />
                </Providers>
            </body>
        </html>
    );
}
