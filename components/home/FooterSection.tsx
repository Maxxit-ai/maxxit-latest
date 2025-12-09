const FooterSection = () => (
  <footer className="py-12 border-t border-[var(--border)]">
    <div className="max-w-7xl mx-auto px-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 border border-[var(--accent)] flex items-center justify-center">
            <span className="text-accent text-sm">M</span>
          </div>
          <span className="font-display">MAXXIT</span>
        </div>
        <p className="text-xs text-[var(--text-muted)] text-center">
          DeFi trading involves risk. Past performance ≠ future results. Non-custodial & gasless.
        </p>
        <p className="text-xs text-[var(--text-muted)]">© 2025</p>
      </div>
    </div>
  </footer>
);

export default FooterSection;


