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
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6 md:gap-8">
          {/* Brand Section */}
          <div className="space-y-2 sm:space-y-3 md:space-y-4 flex-1">
            <Link href="/" className="flex items-center gap-2 group">
              <Image src="/logo.png" alt="Maxxit" width={1000} height={1000} className="w-20 sm:w-24 md:w-[100px] h-auto" />
            </Link>
            <p className="text-[10px] sm:text-xs text-[var(--text-muted)] leading-relaxed max-w-sm">
              DeFi trading involves risk. Past performance ≠ future results. Non-custodial & gasless.
            </p>
          </div>

          <p className="text-[10px] sm:text-xs md:text-sm text-[var(--text-muted)] text-center sm:text-right">
            © {currentYear} MAXXIT. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;


