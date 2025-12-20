import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import PricingSection from "@/components/PricingSection";
import AgentCard from "@/components/AgentCard";
import greenTealGradient from "@assets/generated_images/Green-teal_agent_card_gradient_48c2fed2.png";
import purpleBlueGradient from "@assets/generated_images/Purple-blue_agent_card_gradient_abb7d596.png";
import orangeRedGradient from "@assets/generated_images/Orange-red_agent_card_gradient_047a4340.png";
import { Github, Twitter, FileText } from "lucide-react";

export default function Landing() {
  const topAgents = [
    {
      id: "1",
      name: "Momentum Trader",
      venue: "GMX" as const,
      status: "ACTIVE" as const,
      apr30d: 42.5,
      sharpe30d: 1.85,
      gradientImage: typeof purpleBlueGradient === 'string' ? purpleBlueGradient : purpleBlueGradient.src,
    },
    {
      id: "2",
      name: "Volatility Hunter",
      venue: "HYPERLIQUID" as const,
      status: "ACTIVE" as const,
      apr30d: 38.2,
      sharpe30d: 1.62,
      gradientImage: typeof orangeRedGradient === 'string' ? orangeRedGradient : orangeRedGradient.src,
    },
    {
      id: "3",
      name: "Trend Follower",
      venue: "SPOT" as const,
      status: "ACTIVE" as const,
      apr30d: 35.7,
      sharpe30d: 1.54,
      gradientImage: typeof greenTealGradient === 'string' ? greenTealGradient : greenTealGradient.src,
    },
  ];

  return (
    <div className="min-h-screen">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <a className="text-2xl font-bold" data-testid="link-logo">
              Maxxit
            </a>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild data-testid="button-nav-agents">
              <Link href="/agents">Agents</Link>
            </Button>
            <Button variant="ghost" asChild data-testid="button-nav-dashboard">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <ThemeToggle />
            <Button asChild data-testid="button-connect-wallet">
              <Link href="/dashboard">Connect Wallet</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="pt-16">
        <Hero
          onExploreAgents={() => {
            const element = document.getElementById("agents-showcase");
            element?.scrollIntoView({ behavior: "smooth" });
          }}
          onLearnMore={() => {
            const element = document.getElementById("how-it-works");
            element?.scrollIntoView({ behavior: "smooth" });
          }}
        />

        <section id="agents-showcase" className="py-20 px-4" data-testid="section-agents-showcase">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold tracking-tight mb-4">
                Top Performing Agents
              </h2>
              <p className="text-xl text-muted-foreground">
                Discover agents with proven track records
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {topAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  {...agent}
                  onDeploy={(id) => console.log("Deploy agent:", id)}
                  onViewDetails={(id) => console.log("View details:", id)}
                />
              ))}
            </div>

            <div className="text-center">
              <Button variant="outline" size="lg" asChild data-testid="button-view-all-agents">
                <Link href="/agents">View All Agents</Link>
              </Button>
            </div>
          </div>
        </section>

        <div id="how-it-works">
          <HowItWorks />
        </div>

        <PricingSection />

        <footer className="border-t border-border py-12 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
              <div>
                <h3 className="font-bold text-lg mb-4">Maxxit</h3>
                <p className="text-sm text-muted-foreground">
                  Agentic DeFi trading powered by crypto Twitter signals.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Product</h4>
                <ul className="space-y-2 text-sm">
                  <li>
                    <Link href="/agents">
                      <a className="text-muted-foreground hover:text-foreground">Agents</a>
                    </Link>
                  </li>
                  <li>
                    <Link href="/dashboard">
                      <a className="text-muted-foreground hover:text-foreground">Dashboard</a>
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Resources</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>Documentation</li>
                  <li>API Reference</li>
                  <li>Support</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Community</h4>
                <div className="flex gap-3">
                  <Button variant="ghost" size="icon" data-testid="button-github">
                    <Github className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" data-testid="button-twitter">
                    <Twitter className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" data-testid="button-docs">
                    <FileText className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="pt-8 border-t border-border text-center text-sm text-muted-foreground">
              <p>
                DeFi trading involves substantial risk. Past performance is not indicative of
                future results.
              </p>
              <p className="mt-2">© 2025 Maxxit. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
