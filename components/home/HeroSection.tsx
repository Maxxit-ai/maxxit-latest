import Link from 'next/link';
import LightPillar from './LightPillar';
import SplitText from '../SplitText';

interface HeroSectionProps {
  onDeployScroll: () => void;
  onLearnMoreScroll: () => void;
}

const HeroSection = ({ onDeployScroll, onLearnMoreScroll }: HeroSectionProps) => {
  return (
    <section className="py-16 relative flex-1 flex items-center overflow-hidden bg-black">
      <div className="absolute inset-0 w-full flex-1">
        <LightPillar
          topColor="#016b38"
          bottomColor="#1b5439"
          intensity={0.7}
          rotationSpeed={0.3}
          glowAmount={0.006}
          pillarWidth={3.0}
          pillarHeight={0.4}
          noiseIntensity={0.5}
          pillarRotation={75}
          interactive={false}
          mixBlendMode="screen"
        />
      </div>

      <div className="max-w-5xl mx-auto px-6 text-center relative z-10">
        <p className="text-sm text-accent mb-6 tracking-widest font-mono">
          THE DECENTRALIZED TRADING ECONOMY
        </p>

        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl leading-[0.9] mb-8">
          <SplitText
            text="TRADE LIKE AN"
            tag="span"
            className="font-display text-5xl md:text-7xl lg:text-8xl block"
            delay={50}
            duration={0.8}
            ease="power3.out"
            splitType="chars"
            from={{ opacity: 0, y: 50, rotationX: -90 }}
            to={{ opacity: 1, y: 0, rotationX: 0 }}
            threshold={0.3}
            rootMargin="0px"
            textAlign="center"
          />
          <SplitText
            text="INSTITUTION"
            tag="span"
            className="font-display text-5xl md:text-7xl lg:text-8xl text-accent block"
            delay={50}
            duration={0.8}
            ease="power3.out"
            splitType="chars"
            from={{ opacity: 0, y: 50, rotationX: -90 }}
            to={{ opacity: 1, y: 0, rotationX: 0 }}
            threshold={0.3}
            rootMargin="0px"
            textAlign="center"
          />
          {/* <span className="cursor-blink text-[var(--text-primary)] delay-75"></span> */}
        </h1>

        <p className="max-w-3xl mx-auto mb-10 text-base md:text-lg text-[var(--text-secondary)] leading-relaxed">
          Three AI agents work together: one finds the best alpha from research institutes and crypto Twitter,
          one becomes your 24/7 trading clone that sets position size and leverage, and one routes trades
          to the optimal venue for gasless, non-custodial execution.
        </p>

        <div className="flex flex-wrap justify-center gap-4 mb-16">
          <button
            onClick={(e) => {
              e.preventDefault();
              onDeployScroll();
            }}
            className="group px-8 py-4 bg-accent text-[var(--bg-deep)] font-bold text-lg hover:bg-[var(--accent-dim)] transition-all"
          >
            DEPLOY AN AGENT
            <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">→</span>
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              onLearnMoreScroll();
            }}
            className="px-8 py-4 border border-[var(--border)] font-bold text-lg hover:border-accent hover:text-accent transition-all"
          >
            LEARN MORE
          </button>
        </div>

        <div className="flex flex-wrap justify-center gap-8 md:gap-16">
          <div>
            <p className="font-display text-3xl text-accent">261</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">TRADING PAIRS</p>
          </div>
          <div>
            <p className="font-display text-3xl text-accent">24/7</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">AUTOMATED</p>
          </div>
          <div>
            <p className="font-display text-3xl text-accent">100%</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">NON-CUSTODIAL</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;


