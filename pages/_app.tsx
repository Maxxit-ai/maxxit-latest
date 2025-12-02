import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { PrivyProvider } from '@privy-io/react-auth';

export default function App({ Component, pageProps }: AppProps) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const isBuildTime = typeof window === 'undefined' && !privyAppId;

  // During build-time prerendering without Privy app ID, skip PrivyProvider
  if (isBuildTime) {
    return (
      <>
        <Head>
          <title>Maxxit - Agentic DeFi Trading Platform</title>
          <meta name="description" content="Deploy AI-powered trading agents that execute trades based on crypto Twitter signals" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <Component {...pageProps} />
      </>
    );
  }

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
