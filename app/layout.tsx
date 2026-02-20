import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Geist, Geist_Mono } from 'next/font/google'
import { ApolloProvider } from './apollo-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { FilterProvider } from '@/context/FilterContext'
import { FilterUrlSync } from '@/components/FilterUrlSync'
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
              <Suspense fallback={null}>
                <FilterUrlSync />
              </Suspense>
              {children}
            </FilterProvider>
          </ApolloProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
