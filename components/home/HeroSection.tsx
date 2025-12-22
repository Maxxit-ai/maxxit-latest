import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect, useRef, memo, useCallback } from "react";
import dynamic from "next/dynamic";
import SplitText from "../SplitText";
import Image from "next/image";
import BrushstrokeBackground from "./BrushstrokeBackground";

// Lazy load LightPillar to reduce initial bundle size
const LightPillar = dynamic(() => import("./LightPillar"), {
  ssr: false,
  loading: () => null,
});

interface HeroSectionProps {
  onDeployScroll: () => void;
  onLearnMoreScroll: () => void;
}

interface AnimatedNumberProps {
  value: number | string;
  duration?: number;
  suffix?: string;
}

const AnimatedNumber = memo(
  ({ value, duration = 2000, suffix = "" }: AnimatedNumberProps) => {
    const [displayValue, setDisplayValue] = useState<number | string>(
      typeof value === "number" ? 0 : value
    );
    const hasAnimatedRef = useRef(false);
    const elementRef = useRef<HTMLSpanElement>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry.isIntersecting && !hasAnimatedRef.current) {
            hasAnimatedRef.current = true;

            if (typeof value === "number") {
              const startValue = 0;
              const endValue = value;
              const startTime = performance.now();

              const animate = (currentTime: number) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Easing function (ease-out)
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const currentValue = Math.floor(
                  startValue + (endValue - startValue) * easeOut
                );

                setDisplayValue(currentValue);

                if (progress < 1) {
                  rafRef.current = requestAnimationFrame(animate);
                } else {
                  setDisplayValue(endValue);
                  rafRef.current = null;
                }
              };

              rafRef.current = requestAnimationFrame(animate);
            } else {
              // For string values like "24/7"
              setDisplayValue(value);
            }
          }
        },
        { threshold: 0.3, rootMargin: "50px" }
      );

      const currentElement = elementRef.current;
      if (currentElement) {
        observer.observe(currentElement);
      }

      return () => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
        }
        if (currentElement) {
          observer.unobserve(currentElement);
        }
      };
    }, [value, duration]);

    return (
      <span ref={elementRef} className="inline-block">
        {displayValue}
        {suffix}
      </span>
    );
  }
);

AnimatedNumber.displayName = "AnimatedNumber";

const HeroSection = memo(
  ({ onDeployScroll, onLearnMoreScroll }: HeroSectionProps) => {
    const router = useRouter();

    const handleDeployClick = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        onDeployScroll();
      },
      [onDeployScroll]
    );

    const handleLearnMoreClick = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        onLearnMoreScroll();
      },
      [onLearnMoreScroll]
    );

    const handleLazyTradingClick = useCallback(() => {
      router.push("/lazy-trading");
    }, [router]);

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

          <h1 className="text-5xl md:text-6xl lg:text-8xl ">
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
          </h1>

          <p className="max-w-4xl mx-auto mb-8  md:text-xl text-[var(--text-secondary)] leading-relaxed">
          Join an Alpha Club to automate your trading. Three AI agents work together to find signals, execute with your risk style, and route to the best venue — all while your funds stay in your wallet.
        </p>

          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <button
              onClick={handleDeployClick}
              className="group px-8 py-4 bg-accent text-[var(--bg-deep)] font-bold text-lg hover:bg-[var(--accent-dim)] transition-all"
            >
              JOIN ALPHA CLUB
              <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">
                →
              </span>
            </button>
            <button
              onClick={handleLazyTradingClick}
              className="group px-8 py-4 border-2 border-accent text-accent font-bold text-lg hover:bg-accent hover:text-[var(--bg-deep)] transition-all"
            >
              LAZY TRADING
              <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">
                ⚡
              </span>
            </button>
            <button
              onClick={handleLearnMoreClick}
              className="px-8 py-4 border border-[var(--border)] font-bold text-lg hover:border-accent hover:text-accent transition-all"
            >
              LEARN MORE
            </button>
          </div>

          {/* Powered by Eigen AI */}
          <div className="relative inline-block mx-auto mb-12 px-6 py-3 transition-all duration-300 group">
            {/* Corner decorations */}
            <div className="absolute -top-1 -left-1 w-4 h-4 border-t-8 border-l-8 border-[var(--accent)] opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="absolute -top-1 -right-1 w-4 h-4 border-t-8 border-r-8 border-[var(--accent)] opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-8 border-l-8 border-[var(--accent)] opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-8 border-r-8 border-[var(--accent)] opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>

            {/* Glow effect on hover */}
            <div className="absolute inset-0 opacity-0 transition-opacity duration-300"></div>

            <div className="flex items-center gap-2 relative z-10">
              <span className="text-lg font-mono text-[var(--text-elevated)] tracking-wider transition-colors duration-300">
                POWERED BY
              </span>
              <BrushstrokeBackground className="p-2">
                <div className="px-1 py-0.5">
                  <Image
                    src="/eigenai.png"
                    alt="Eigen AI"
                    width={100}
                    height={100}
                    priority
                    loading="eager"
                    quality={85}
                  />
                </div>
              </BrushstrokeBackground>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-8 md:gap-16">
            <div className="text-center">
              <p className="font-display text-5xl text-accent">
                <AnimatedNumber value={261} duration={2000} />
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                TRADING PAIRS
              </p>
            </div>
            <div className="text-center">
              <p className="font-display text-5xl text-accent">
                <AnimatedNumber value="24/7" duration={1500} />
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">AUTOMATED</p>
            </div>
            <div className="text-center">
              <p className="font-display text-5xl text-accent">
                <AnimatedNumber value={100} duration={2000} suffix="%" />
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                NON-CUSTODIAL
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }
);

HeroSection.displayName = "HeroSection";

export default HeroSection;
