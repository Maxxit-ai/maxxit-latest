/**
 * GMX Setup Button Component
 * 
 * Add this anywhere in your UI for ONE-CLICK GMX setup
 * 
 * Usage:
 * <GMXSetupButton safeAddress="0x..." />
 */

import { useState } from 'react';
import { useRouter } from 'next/router';

interface Props {
  safeAddress: string;
  onSetupComplete?: () => void;
}

export default function GMXSetupButton({ safeAddress, onSetupComplete }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSetup = async () => {
    setLoading(true);

    try {
      // Call API to generate transaction
      const response = await fetch('/api/gmx/generate-setup-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safeAddress }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      // Option 1: Redirect to dedicated setup page
      router.push(`/gmx-setup?safe=${safeAddress}`);

      // Option 2: Open Safe Transaction Builder with deep link
      // window.open(data.safeAppLink, '_blank');

      // Option 3: Download JSON for manual import
      // const blob = new Blob([JSON.stringify(data.transactionBuilderJSON, null, 2)], {
      //   type: 'application/json',
      // });
      // const url = URL.createObjectURL(blob);
      // const a = document.createElement('a');
      // a.href = url;
      // a.download = 'maxxit-gmx-setup.json';
      // a.click();
    } catch (error: any) {
      console.error('Setup error:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSetup}
      disabled={loading}
      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? '⏳ Preparing...' : '🚀 Setup GMX Trading (ONE-CLICK)'}
    </button>
  );
}

