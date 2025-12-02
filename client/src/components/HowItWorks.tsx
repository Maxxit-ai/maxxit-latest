import { Wallet, Bot, TrendingUp } from "lucide-react";

export default function HowItWorks() {
  const steps = [
    {
      icon: Wallet,
      title: "Connect Safe Wallet",
      description: "Link your non-custodial Safe wallet. You retain full control of your assets at all times.",
    },
    {
      icon: Bot,
      title: "Deploy Agent",
      description: "Choose from top-performing agents or create your own with custom strategy weights.",
    },
    {
      icon: TrendingUp,
      title: "Earn Returns",
      description: "Agents execute trades based on Twitter signals. Track real-time performance and PnL.",
    },
  ];

  return (
    <section className="py-20 px-4" data-testid="section-how-it-works">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold tracking-tight mb-4" data-testid="heading-how-it-works">
            How It Works
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Get started with agentic DeFi trading in three simple steps
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {steps.map((step, index) => (
            <div key={index} className="flex flex-col items-center text-center" data-testid={`step-${index + 1}`}>
              <div className="relative mb-6">
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <step.icon className="h-10 w-10 text-primary" />
                </div>
                <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
              <p className="text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
