import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ThemeToggle from "@/components/ThemeToggle";
import AgentCard from "@/components/AgentCard";
import greenTealGradient from "@assets/generated_images/Green-teal_agent_card_gradient_48c2fed2.png";
import purpleBlueGradient from "@assets/generated_images/Purple-blue_agent_card_gradient_abb7d596.png";
import orangeRedGradient from "@assets/generated_images/Orange-red_agent_card_gradient_047a4340.png";
import { Search } from "lucide-react";

export default function AgentList() {
  const [venue, setVenue] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("apr30d");
  const [searchQuery, setSearchQuery] = useState("");

  const agents = [
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
    {
      id: "4",
      name: "Signal Amplifier",
      venue: "GMX" as const,
      status: "ACTIVE" as const,
      apr30d: 31.2,
      sharpe30d: 1.42,
      gradientImage: typeof greenTealGradient === 'string' ? greenTealGradient : greenTealGradient.src,
    },
    {
      id: "5",
      name: "Breakout Detector",
      venue: "HYPERLIQUID" as const,
      status: "PAUSED" as const,
      apr30d: 28.9,
      sharpe30d: 1.28,
      gradientImage: typeof purpleBlueGradient === 'string' ? purpleBlueGradient : purpleBlueGradient.src,
    },
    {
      id: "6",
      name: "Mean Reversion",
      venue: "SPOT" as const,
      status: "ACTIVE" as const,
      apr30d: 25.4,
      sharpe30d: 1.15,
      gradientImage: typeof orangeRedGradient === 'string' ? orangeRedGradient : orangeRedGradient.src,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <a className="text-2xl font-bold" data-testid="link-logo">
              Maxxit
            </a>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/agents">Agents</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <ThemeToggle />
            <Button asChild data-testid="button-connect-wallet">
              <Link href="/dashboard">Connect Wallet</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight mb-2" data-testid="heading-agent-list">
            Trading Agents
          </h1>
          <p className="text-muted-foreground">
            Browse and deploy top-performing AI trading agents
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
          <Select value={venue} onValueChange={setVenue}>
            <SelectTrigger className="w-full md:w-48" data-testid="select-venue">
              <SelectValue placeholder="Venue" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Venues</SelectItem>
              <SelectItem value="GMX">GMX</SelectItem>
              <SelectItem value="HYPERLIQUID">Hyperliquid</SelectItem>
              <SelectItem value="SPOT">Spot</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full md:w-48" data-testid="select-sort">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="apr30d">30d APR</SelectItem>
              <SelectItem value="sharpe30d">Sharpe Ratio</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              {...agent}
              onDeploy={(id) => console.log("Deploy agent:", id)}
              onViewDetails={(id) => console.log("View details:", id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
