import Link from 'next/link';

const CTASection = () => (
  <section className="py-24 border-t border-[var(--border)] bg-[var(--bg-surface)]">
    <div className="max-w-4xl mx-auto px-6 text-center">
      <p className="data-label mb-6">JOIN THE ECONOMY</p>
      <h2 className="font-display text-4xl md:text-6xl mb-6">
        TRADE LIKE AN<br />
        <span className="text-accent">INSTITUTION</span>
      </h2>
      <p className="font-serif text-lg text-[var(--text-secondary)] italic mb-10 max-w-xl mx-auto">
        Best-in-class alpha. 24/7 automated execution.
        Non-custodial. Transparent. Decentralized.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <Link href="#agents">
          <button className="px-8 py-4 bg-accent text-[var(--bg-deep)] font-bold text-lg hover:bg-[var(--accent-dim)] transition-all">
            GET STARTED →
          </button>
        </Link>
        <Link href="/docs">
          <button className="px-8 py-4 border border-[var(--border)] font-bold text-lg hover:border-accent hover:text-accent transition-all">
            READ DOCS
          </button>
        </Link>
      </div>
    </div>
  </section>
);

export default CTASection;


