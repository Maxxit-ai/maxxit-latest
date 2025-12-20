import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Shield, BarChart3, TrendingUp } from "lucide-react";
import heroBackground from "@assets/generated_images/DeFi_hero_background_visualization_f4609b44.png";

interface HeroProps {
  onExploreAgents?: () => void;
  onLearnMore?: () => void;
}

export default function Hero({ onExploreAgents, onLearnMore }: HeroProps) {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={typeof heroBackground === 'string' ? heroBackground : heroBackground.src}
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/90 to-background" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-20 text-center">
        <Badge className="mb-6 bg-primary/20 text-primary border-primary/30 hover:bg-primary/30" data-testid="badge-trust">
          <Shield className="h-3 w-3 mr-1" />
          Non-Custodial • Transparent • Performance-Driven
        </Badge>

        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6" data-testid="heading-hero">
          Agentic DeFi Trading,
          <br />
          <span className="text-primary">Powered by Crypto Twitter</span>
        </h1>

        <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-12" data-testid="text-hero-subtitle">
          Deploy AI trading agents that analyze signals from crypto Twitter's top minds.
          Non-custodial execution through Safe wallets with full transparency.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
          <Button
            size="lg"
            className="text-lg px-8"
            onClick={onExploreAgents}
            data-testid="button-explore-agents"
          >
            Explore Agents
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="text-lg px-8 bg-background/10 backdrop-blur-md border-border/50"
            onClick={onLearnMore}
            data-testid="button-learn-more"
          >
            How It Works
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div className="text-3xl font-bold font-mono text-primary" data-testid="text-avg-apr">42.5%</div>
            <div className="text-sm text-muted-foreground">Average 30d APR</div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            <div className="text-3xl font-bold font-mono" data-testid="text-active-agents">12</div>
            <div className="text-sm text-muted-foreground">Active Trading Agents</div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div className="text-3xl font-bold font-mono" data-testid="text-safe-deployments">340+</div>
            <div className="text-sm text-muted-foreground">Safe Deployments</div>
          </div>
        </div>
      </div>
    </section>
  );
}
