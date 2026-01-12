import Link from 'next/link';

const CTASection = () => (
  <section className="py-12 sm:py-16 md:py-20 lg:py-24 border-t border-[var(--border)] bg-[var(--bg-surface)]">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
      <p className="data-label mb-4 sm:mb-6">JOIN THE ECONOMY</p>
      <h2 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-6xl mb-4 sm:mb-6">
        TRADE LIKE AN<br />
        <span className="text-accent">INSTITUTION</span>
      </h2>
      <p className="font-serif text-sm sm:text-base md:text-lg text-[var(--text-secondary)] italic mb-6 sm:mb-8 md:mb-10 max-w-xl mx-auto">
        Best-in-class alpha. 24/7 automated execution.
        Non-custodial. Transparent. Decentralized.
      </p>
      <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 sm:gap-4">
        <Link href="#agents">
          <button className="px-4 sm:px-6 md:px-8 py-3 sm:py-4 bg-accent text-[var(--bg-deep)] font-bold text-sm sm:text-base md:text-lg hover:bg-[var(--accent-dim)] transition-all w-full sm:w-auto">
            GET STARTED →
          </button>
        </Link>
        <Link href="/docs">
          <button className="px-4 sm:px-6 md:px-8 py-3 sm:py-4 border border-[var(--border)] font-bold text-sm sm:text-base md:text-lg hover:border-accent hover:text-accent transition-all w-full sm:w-auto">
            READ DOCS
          </button>
        </Link>
      </div>
    </div>
  </section>
);

export default CTASection;


