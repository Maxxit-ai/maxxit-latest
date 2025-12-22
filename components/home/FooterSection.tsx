import Link from 'next/link';
import { Home, Wallet, User, TrendingUp, FileText, Plus, Github, Twitter, ExternalLink } from 'lucide-react';
import Image from 'next/image';

const FooterSection = () => {
  const currentYear = new Date().getFullYear();

  const navLinks = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/my-deployments', label: 'Deployments', icon: Wallet },
    { href: '/your-trades', label: 'Your Trades', icon: TrendingUp },
    { href: '/creator', label: 'My Agents', icon: User },
    { href: '/docs', label: 'Docs', icon: FileText },
    { href: '/create-agent', label: 'Create Club', icon: Plus },
  ];

  const socialLinks = [
    { href: 'https://twitter.com', label: 'Twitter', icon: Twitter },
    { href: 'https://github.com', label: 'GitHub', icon: Github },
  ];

  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between gap-8 mb-8">
          {/* Brand Section */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2 group">
              <Image src="/logo.png" alt="Maxxit" width={100} height={100} />
            </Link>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-sm">
              DeFi trading involves risk. Past performance ≠ future results. Non-custodial & gasless.
            </p>
          </div>

          <p className="text-sm text-[var(--text-muted)]">
            © {currentYear} MAXXIT. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;


