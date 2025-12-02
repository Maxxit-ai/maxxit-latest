import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

export default function PricingSection() {
  const fees = [
    {
      title: "Infrastructure Fee",
      amount: "$0.20",
      per: "per trade",
      description: "Covers gas costs and venue execution",
      features: ["Automatic execution", "Multi-venue support", "Real-time monitoring"],
    },
    {
      title: "Profit Share",
      amount: "10%",
      per: "on profitable trades",
      description: "Only pay when you win",
      features: ["Aligned incentives", "No loss charges", "Transparent calculation"],
      highlight: true,
    },
    {
      title: "Monthly Subscription",
      amount: "$20",
      per: "per deployment",
      description: "Per active agent deployment",
      features: ["First month free", "Cancel anytime", "Full feature access"],
    },
  ];

  return (
    <section className="py-20 px-4 bg-secondary/30" data-testid="section-pricing">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold tracking-tight mb-4" data-testid="heading-pricing">
            Transparent Pricing
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            No hidden fees. Simple, performance-based pricing structure.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {fees.map((fee, index) => (
            <Card
              key={index}
              className={fee.highlight ? "border-primary shadow-lg" : ""}
              data-testid={`card-pricing-${index + 1}`}
            >
              {fee.highlight && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                  Performance-Based
                </Badge>
              )}
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-lg mb-2">{fee.title}</CardTitle>
                <div>
                  <span className="text-4xl font-bold font-mono">{fee.amount}</span>
                  <span className="text-muted-foreground ml-2">{fee.per}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{fee.description}</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {fee.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Badge variant="secondary" className="text-sm" data-testid="badge-no-hidden-fees">
            No Hidden Fees • Full Transparency • Cancel Anytime
          </Badge>
        </div>
      </div>
    </section>
  );
}
