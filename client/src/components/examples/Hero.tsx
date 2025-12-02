import Hero from '../Hero'

export default function HeroExample() {
  const handleExplore = () => {
    console.log('Explore agents clicked')
  }

  const handleLearnMore = () => {
    console.log('Learn more clicked')
  }

  return <Hero onExploreAgents={handleExplore} onLearnMore={handleLearnMore} />
}
