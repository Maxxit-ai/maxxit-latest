import Link from 'next/link';
import { Home, Wallet, User, TrendingUp, FileText, Plus, Github, Twitter, ExternalLink } from 'lucide-react';

const FooterSection = () => {
  const currentYear = new Date().getFullYear();

  const navLinks = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/my-deployments', label: 'Deployments', icon: Wallet },
    { href: '/your-trades', label: 'Your Trades', icon: TrendingUp },
    { href: '/creator', label: 'My Agents', icon: User },
    { href: '/docs', label: 'Docs', icon: FileText },
    { href: '/create-agent', label: 'Create Agent', icon: Plus },
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
              <div className="w-8 h-8 border border-[var(--accent)] flex items-center justify-center group-hover:bg-[var(--accent)]/10 transition-colors">
                <span className="text-accent font-bold text-sm">M</span>
              </div>
              <span className="font-display text-xl tracking-wide">MAXXIT</span>
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


