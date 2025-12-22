import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { PrivyProvider } from '@privy-io/react-auth';
import { useEffect } from 'react';
import Lenis from 'lenis';

export default function App({ Component, pageProps }: AppProps) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const isBuildTime = typeof window === 'undefined' && !privyAppId;

  // During build-time prerendering without Privy app ID, skip PrivyProvider
  if (isBuildTime) {
    return (
      <>
        <Head>
          <title>Maxxit - Agentic DeFi Trading Platform</title>
          <meta name="description" content="Maxxit is a non-custodial AI trading platform that turns benchmarked alpha into automated execution." />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <Component {...pageProps} />
      </>
    );
  }

  // Initialize Lenis smooth scroll (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let lenis: Lenis | null = null;
    let rafId: number | null = null;

    // Dynamically import GSAP only on client-side
    Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger')
    ]).then(([{ gsap }, { ScrollTrigger }]) => {
      // Register ScrollTrigger plugin
      gsap.registerPlugin(ScrollTrigger);

      lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 2,
        infinite: false,
      });

      // Integrate Lenis with GSAP ScrollTrigger
      function raf(time: number) {
        lenis?.raf(time);
        rafId = requestAnimationFrame(raf);
      }

      rafId = requestAnimationFrame(raf);

      // Update ScrollTrigger when Lenis scrolls
      lenis.on('scroll', ScrollTrigger.update);
    }).catch((error) => {
      console.error('Failed to load GSAP:', error);
    });

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (lenis) {
        lenis.destroy();
      }
    };
  }, []);

  // Always render the same structure to avoid hydration mismatches
  // PrivyProvider handles SSR gracefully and will work even with empty appId during SSR
  return (
    <PrivyProvider
      appId={privyAppId || ''}
      config={{
        loginMethods: ['wallet', 'email'],
        appearance: {
          theme: 'dark',
          accentColor: '#22c55e',
          logo: undefined,
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          }
        },
      }}
    >
      <Head>
        <title>Maxxit - Agentic DeFi Trading Platform</title>
        <meta name="description" content="Deploy AI-powered trading agents that execute trades based on crypto Twitter signals" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Component {...pageProps} />
    </PrivyProvider>
  );
}
