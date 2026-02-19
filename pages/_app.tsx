import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import type { LoginMethodOrderOption } from '@privy-io/react-auth';
import { PrivyProvider } from '@privy-io/react-auth';
import { useEffect } from 'react';
import Lenis from 'lenis';
import SupportAssistant from '../components/SupportAssistant';
import { LoginBonusProvider } from '../components/LoginBonusProvider';
import { Analytics } from '@vercel/analytics/next';

export default function App({ Component, pageProps }: AppProps) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const crossAppProviderId = process.env.NEXT_PUBLIC_PRIVY_PROVIDER_APP_ID;
  const primaryLoginMethods: [LoginMethodOrderOption, ...LoginMethodOrderOption[]] = ['email', 'detected_ethereum_wallets'];
  if (crossAppProviderId) {
    primaryLoginMethods.push(`privy:${crossAppProviderId}`);
  }
  const loginMethodsAndOrder = {
    primary: primaryLoginMethods,
  };
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
          
          {/* Open Graph & Twitter Card Meta Tags */}
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="Maxxit" />
          <meta property="og:title" content="Maxxit - Agentic DeFi Trading Platform" />
          <meta property="og:description" content="Discover and join AI-powered trading agents with proven alpha. Non-custodial, automated, transparent." />
          <meta property="og:url" content="https://maxxit.ai" />
          <meta property="og:image" content="https://maxxit.ai/maxxit-og-image.png" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Maxxit - Agentic DeFi Trading Platform" />
          <meta name="twitter:description" content="Discover and join AI-powered trading agents with proven alpha. Non-custodial, automated, transparent." />
          <meta name="twitter:image" content="https://maxxit.ai/maxxit-og-image.png" />
          <meta name="twitter:site" content="@MaxxitAI" />
          <meta name="twitter:creator" content="@MaxxitAI" />
        </Head>
        <Component {...pageProps} />
        <SupportAssistant />
        <Analytics />
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
        loginMethodsAndOrder,
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
      <LoginBonusProvider>
        <Head>
          <title>Maxxit - Agentic DeFi Trading Platform</title>
          <meta name="description" content="Maxxit is a non-custodial AI trading platform that turns benchmarked alpha into automated execution." />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
          
          {/* Open Graph & Twitter Card Meta Tags */}
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="Maxxit" />
          <meta property="og:title" content="Maxxit - Agentic DeFi Trading Platform" />
          <meta property="og:description" content="Discover and join AI-powered trading agents with proven alpha. Non-custodial, automated, transparent." />
          <meta property="og:url" content="https://maxxit.ai" />
          <meta property="og:image" content="https://maxxit.ai/maxxit-og-image.png" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Maxxit - Agentic DeFi Trading Platform" />
          <meta name="twitter:description" content="Discover and join AI-powered trading agents with proven alpha. Non-custodial, automated, transparent." />
          <meta name="twitter:image" content="https://maxxit.ai/maxxit-og-image.png" />
          <meta name="twitter:site" content="@MaxxitAI" />
          <meta name="twitter:creator" content="@MaxxitAI" />
        </Head>
        <Component {...pageProps} />
        <SupportAssistant />
      </LoginBonusProvider>
      <Analytics />
    </PrivyProvider>
  );
}
