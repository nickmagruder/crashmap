import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Geist, Geist_Mono } from 'next/font/google'
import { ApolloProvider } from './apollo-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { FilterProvider } from '@/context/FilterContext'
import { FilterUrlSync } from '@/components/FilterUrlSync'
import { Toaster } from '@/components/ui/sonner'
import 'mapbox-gl/dist/mapbox-gl.css'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'CrashMap',
  description: 'Bike & Ped Crash Data Mapped',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💥</text></svg>",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ApolloProvider>
            <FilterProvider>
              <a
                href="#map-region"
                className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
              >
                Skip to main content
              </a>
              <Suspense fallback={null}>
                <FilterUrlSync />
              </Suspense>
              {children}
              <Toaster />
            </FilterProvider>
          </ApolloProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
