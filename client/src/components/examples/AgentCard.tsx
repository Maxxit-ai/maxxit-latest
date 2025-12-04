import AgentCard from '../AgentCard'
import greenTealGradient from '@assets/generated_images/Green-teal_agent_card_gradient_48c2fed2.png'
import purpleBlueGradient from '@assets/generated_images/Purple-blue_agent_card_gradient_abb7d596.png'
import orangeRedGradient from '@assets/generated_images/Orange-red_agent_card_gradient_047a4340.png'

export default function AgentCardExample() {
  const handleDeploy = (id: string) => {
    console.log('Deploy agent:', id)
  }

  const handleViewDetails = (id: string) => {
    console.log('View details:', id)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
      <AgentCard
        id="1"
        name="Momentum Trader"
        venue="GMX"
        status="ACTIVE"
        apr30d={42.5}
        sharpe30d={1.85}
        gradientImage={typeof purpleBlueGradient === 'string' ? purpleBlueGradient : purpleBlueGradient.src}
        onDeploy={handleDeploy}
        onViewDetails={handleViewDetails}
      />
      <AgentCard
        id="2"
        name="Volatility Hunter"
        venue="HYPERLIQUID"
        status="ACTIVE"
        apr30d={38.2}
        sharpe30d={1.62}
        gradientImage={typeof orangeRedGradient === 'string' ? orangeRedGradient : orangeRedGradient.src}
        onDeploy={handleDeploy}
        onViewDetails={handleViewDetails}
      />
      <AgentCard
        id="3"
        name="Trend Follower"
        venue="SPOT"
        status="PAUSED"
        apr30d={28.7}
        sharpe30d={1.34}
        gradientImage={typeof greenTealGradient === 'string' ? greenTealGradient : greenTealGradient.src}
        onDeploy={handleDeploy}
        onViewDetails={handleViewDetails}
      />
    </div>
  )
}
