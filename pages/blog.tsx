import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Twitter, Clock, BookOpen } from 'lucide-react';
import { Header } from '@components/Header';

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Minimal Header for Blog */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="max-w-[680px] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-medium-sans text-xl font-bold text-black hover:text-gray-600 transition-colors">
            Maxxit
          </Link>
          <Link href="/" className="font-medium-sans text-sm text-gray-500 hover:text-black transition-colors flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
        </div>
      </header>

      {/* Article */}
      <article className="max-w-[680px] mx-auto px-6 py-12">
        {/* Meta */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center">
            <span className="text-white font-medium-sans font-bold text-lg">M</span>
          </div>
          <div>
            <p className="font-medium-sans text-sm font-medium text-black">Maxxit Team</p>
            <div className="flex items-center gap-2 text-gray-500 text-sm font-medium-sans">
              <span>Dec 23, 2024</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                12 min read
              </span>
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="font-medium-serif text-[42px] leading-[52px] font-bold text-black mb-6 tracking-[-0.02em]">
              From Manual Trading to Trustworthy Agents: Why Maxxit Exists
            </h1>

        {/* Subtitle */}
        <p className="font-medium-serif text-[22px] leading-[32px] text-gray-500 mb-12">
              Trading didn't start with bots or agents. It started with humans making judgment calls.
            </p>

        {/* Content */}
        <div className="prose-medium">
          <p>
              You'd track a handful of sources, build conviction, place the trade, and stay glued to the chart until exit. That workflow still works.
            </p>

          <p>
              But in crypto, it comes at a brutal cost:
            </p>

          <ul>
            <li>It eats time</li>
            <li>It's emotionally expensive</li>
            <li>You miss moves when you're offline</li>
            <li>And even when your idea is right, execution can be sloppy</li>
            </ul>
            
          <div className="my-10 p-8 bg-gray-50 border-l-4 border-black">
            <p className="font-medium-serif text-xl font-semibold text-black mb-3">
              Maxxit exists to take that pain out.
            </p>
            <p className="text-gray-700 mb-0">
              Maxxit is a <strong>non-custodial trading platform</strong> where AI agents handle the repetitive human actions 24/7 while you keep control. It turns signals from sources you trust into real trades, sizes them to your risk style, routes them to the best venue, and monitors positions continuously.
              </p>
            </div>

          <div className="border-t border-gray-200 my-12" />

          <h2>The Evolution: Humans → Bots → Agents</h2>
          <p className="text-gray-500 italic">(and why trust became the missing piece)</p>

          <h3>1) Manual Trading: Smart, but Human</h3>

          <p>Manual trading is basically three steps:</p>

          <ol>
            <li><strong>What</strong> to trade (pick the asset)</li>
            <li><strong>How</strong> to trade (size, leverage, risk)</li>
            <li><strong>Where</strong> to trade (venue + execution + monitoring)</li>
                </ol>

          <p>Humans are good at context and judgment. But we're also inconsistent, emotional, not available 24/7, and hesitant at critical moments.</p>

          <p className="text-gray-500 italic">
                  That's why even good alpha often doesn't translate into good results.
                </p>

          <h3>2) Bots: Tireless, but Static</h3>

          <p>
            Bots solved one thing: <strong>stamina</strong>. They can run all day. They don't get tired. They don't panic.
          </p>

          <p>
            But bots are <strong>rigid</strong>. They follow fixed rules. They can't really understand messy, human alpha like:
          </p>

          <ul>
            <li>A trader's tweet</li>
            <li>A research note</li>
            <li>A Telegram call with nuance</li>
                </ul>

          <p className="text-gray-500 italic">
                  So bots are consistent, but they're not great at turning "human signals" into "trade instructions."
                </p>

          <h3>3) Agents: Dynamic, but Hard to Trust</h3>

          <p>
            Agents can interpret context and adapt. But most "AI agents" hit a <strong>trust problem</strong>:
          </p>

          <div className="my-8 p-6 bg-gray-100 rounded-lg">
            <p className="mb-0">
              If you feed the same market info into many AI systems twice, you might get two different answers. That randomness is fine for brainstorming. It's <strong>not fine for a system that can place trades</strong>.
                  </p>
                </div>

          <p><strong>And there's a second problem people miss:</strong></p>

          <p>
            <strong>Trading needs objective parameters.</strong> Humans can act on vibes. Machines can't.
          </p>

          <p>A human can read:</p>

          <blockquote>
                  "This looks bullish, maybe rotate into ETH soon."
          </blockquote>

          <p>…but an execution system needs something more structured:</p>

          <ul>
            <li>Which asset?</li>
            <li>Direction?</li>
            <li>Entry trigger?</li>
            <li>Invalidation point?</li>
            <li>Sizing rules?</li>
            <li>Time horizon?</li>
                </ul>

          <div className="my-10 p-8 bg-black text-white">
            <p className="text-white mb-3">
                    If an agent can't reliably convert human alpha into objective, repeatable trade instructions, it'll either do nothing or do unpredictable things.
                  </p>
            <p className="font-semibold text-white mb-0">
                    That's where Maxxit comes in.
                  </p>
                </div>

          <div className="border-t border-gray-200 my-12" />

          <h2>Maxxit Breaks Down Trading: WHAT → HOW → WHERE</h2>
          <p>Maxxit covers the full trading cycle with three agents.</p>

          <h3>Step 1: WHAT to Trade (Picking the Right Signals)</h3>

          <p>
                  Humans start with trust. You follow certain accounts or groups because you believe they move markets.
                </p>

          <div className="my-8 p-6 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="font-semibold text-black mb-2">Example:</p>
            <p className="mb-0">
              Let's say you believe Vitalik's posts influence market sentiment. In Maxxit, you can select Vitalik as a source. When he posts, Maxxit treats it as real-time signal input along with research firms and private Telegram channels.
                  </p>
                </div>
                
          {/* Vitalik Tweet Example */}
          <div className="my-10">
            <div className="flex items-center gap-2 mb-4">
              <Twitter className="h-5 w-5 text-black" />
              <span className="font-medium-sans text-sm font-semibold text-black">Real-World Impact Example</span>
            </div>
            
            {/* Tweet Image */}
            <div className="mb-6">
              <Image 
                src="/Vitalik tweet.png" 
                alt="Vitalik Buterin tweet about Session and SimpleX" 
                width={800} 
                height={600}
                className="w-full h-auto rounded-lg border border-gray-200 shadow-sm"
                priority
              />
                  </div>
                  
            {/* Impact Highlight */}
            <div className="bg-black text-white p-6 rounded-lg">
              <p className="font-medium-sans text-sm font-semibold mb-2 text-green-400">↑ Market Impact</p>
              <p className="font-medium-serif text-lg text-white mb-0">
                Example - The following tweet resulted in <strong className="text-green-400">Session token ($SESH) zooming up by 500%</strong> within hours of posting.
                    </p>
                  </div>
                </div>

          <p className="font-semibold">
            But here's the key: Maxxit doesn't just "copy tweets."
          </p>
          
          <p>It does two things that make this programmable:</p>

          <h4>(a) Benchmark Sources by Performance</h4>
          <p>
            Maxxit tracks outcomes over time and scores sources by their realized impact. So instead of "who's loud," you get <strong>"who's right often enough to matter."</strong>
          </p>

          <h4>(b) Convert Human Alpha into Objective Trade Parameters</h4>
          <p>
            This is the bridge most systems miss. Maxxit turns messy human content (tweets, notes, calls) into structured intent an agent can actually trade:
          </p>

          <ul>
            <li>Asset + direction</li>
            <li>Strength/conviction</li>
            <li>Suggested horizon</li>
            <li>Risk cues (tight vs wide invalidation, momentum vs mean reversion)</li>
            <li>Confidence signal for downstream sizing</li>
          </ul>

          <p className="italic">
            So the agent isn't trading "a post." It's trading a <strong>clean instruction</strong>.
          </p>

          <div className="my-10 p-8 bg-gray-900 text-white rounded-lg">
            <h4 className="text-white font-medium-sans font-semibold mb-3">Why Deterministic AI Matters</h4>
            <p className="text-white">
              If an agent reads Vitalik's post today and labels it "bullish ETH", it should label it the <strong className="text-white">same way tomorrow</strong> if nothing changed.
            </p>
            <p className="text-white mb-3">
              That's what deterministic AI gives you: <strong className="text-white">consistent decisions</strong> instead of "AI mood swings."
            </p>
            <ul className="text-white mb-0 space-y-1">
                    <li>✓ Outputs are reproducible</li>
                    <li>✓ Behavior becomes predictable</li>
                    <li>✓ Debugging becomes possible</li>
                  </ul>
                </div>

          <h3>Step 2: HOW to Trade (Your Trading Clone)</h3>

          <p>
            Even if two people agree on a trade, they won't trade it the same way. One uses 2% size. Another uses 10% with leverage. One scalps. Another holds.
          </p>

          <div className="my-8 p-6 bg-red-50 border-l-4 border-red-500">
            <p className="mb-0">
              That's why traditional copy trading breaks: it copies <strong>exact trades</strong> and assumes you're the same trader.
            </p>
          </div>

          <p className="font-semibold">Maxxit does something more natural:</p>

          <div className="my-8 p-6 bg-gray-50 border-l-4 border-black">
            <p className="mb-0">
              It copies the <strong>intelligence</strong> (the idea) but executes it through <strong>your style</strong>.
                  </p>
                </div>
                
          <p><strong>AGENT HOW becomes your Trading Clone:</strong></p>

          <ul>
            <li>Position sizing tuned to your risk tolerance</li>
            <li>Leverage/exposure aligned to your preferences</li>
            <li>Market + on-chain context awareness</li>
            <li>Consistent execution without emotional drift</li>
          </ul>

          <p className="text-gray-500 italic">
            So you're not copying someone's exact trade. You're copying their <strong>edge</strong> — then trading it like you.
          </p>

          <h3>Step 3: WHERE to Trade (Best Venue + 24/7 Monitoring)</h3>

          <p>Execution matters: slippage, liquidity, fees, liquidation risk, and exits you can't manage offline.</p>

          <div className="my-8 p-6 bg-gray-50 border-l-4 border-black">
            <p className="mb-0">
              <strong>AGENT WHERE</strong> routes to the best venue available and monitors positions continuously — protecting exits and preventing "I forgot to check" liquidations.
                  </p>
                </div>
                
          <div className="border-t border-gray-200 my-12" />

          <h2>Proof It Works: 6,266 Signals Over 6 Months</h2>
          <p className="text-gray-500 italic">(not theory)</p>

          <p>
            Maxxit isn't a "nice idea on paper." We validated the system on a real signal stream over a meaningful period:
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-8">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="font-medium-sans text-3xl font-bold text-black">6,266</div>
              <div className="text-sm text-gray-500 mt-1">Signals Tracked</div>
                  </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="font-medium-sans text-3xl font-bold text-black">88</div>
              <div className="text-sm text-gray-500 mt-1">Sources</div>
                  </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="font-medium-sans text-3xl font-bold text-black">6</div>
              <div className="text-sm text-gray-500 mt-1">Month Window</div>
                  </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="font-medium-sans text-3xl font-bold text-black">85.9%</div>
              <div className="text-sm text-gray-500 mt-1">IPFS Verified</div>
                  </div>
                </div>

          <p>
            We benchmarked performance in the exact way a user experiences the product — by "turning on" agents step-by-step:
          </p>

          <div className="space-y-4 my-8">
            <div className="p-5 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium-sans font-semibold text-black">No Agents (Baseline)</span>
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">Trade all signals equally</span>
              </div>
              <div className="flex gap-8 text-sm">
                <span><span className="text-gray-500">Win Rate:</span> <strong>38.6%</strong></span>
                <span><span className="text-gray-500">Profit Factor:</span> <strong>1.31×</strong></span>
              </div>
            </div>

            <div className="p-5 bg-gray-100 rounded-lg border border-gray-300">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium-sans font-semibold text-black">With AGENT HOW</span>
                <span className="text-xs bg-black text-white px-2 py-1 rounded">Trading Clone</span>
              </div>
              <p className="text-sm text-gray-500 mb-2">Same signals, but personalized sizing/risk</p>
              <div className="flex gap-8 text-sm">
                <span><span className="text-gray-500">Win Rate:</span> <strong>38.6%</strong></span>
                <span><span className="text-gray-500">Profit Factor:</span> <strong className="text-black">1.64×</strong></span>
              </div>
            </div>

            <div className="p-5 bg-black text-white rounded-lg">
                <div className="flex items-center justify-between mb-2">
                <span className="font-medium-sans font-semibold text-white">With AGENT WHAT + AGENT HOW</span>
                <span className="text-xs bg-white text-black px-2 py-1 rounded font-semibold">Full Stack</span>
              </div>
              <p className="text-sm text-white mb-2">Benchmarked source selection + personalized execution</p>
              <div className="flex gap-8 text-sm">
                <span><span className="text-white">Win Rate:</span> <strong className="text-green-400">43.4%</strong></span>
                <span><span className="text-white">Profit Factor:</span> <strong className="text-green-400">2.29×</strong></span>
                </div>
              </div>
            </div>

            {/* Performance Chart */}
          <div className="my-8">
              <Image 
                src="/maxxit_performance_lift.png" 
                alt="Performance Lift by Agent Stack" 
                width={800} 
                height={400}
              className="w-full h-auto rounded-lg border border-gray-200"
              />
            </div>

          <div className="my-10 p-8 bg-gray-50 border-l-4 border-black">
            <p className="mb-0">
              <strong>Takeaway:</strong> Performance improves when the system does what humans struggle with most — source selection + disciplined sizing, continuously.
              </p>
            </div>

          <div className="border-t border-gray-200 my-12" />

          <h2>New "Lazy Trading" Workflows Become Possible</h2>

          <p>
              Once trading becomes agentic and non-custodial, completely new behaviors appear.
            </p>
            
          <p>
              Imagine you don't want dashboards, charts, or constant monitoring. You just want one simple thing:
            </p>
            
          <blockquote className="text-xl">
                "If something important happens, trade it for me safely."
          </blockquote>

          <p>With Maxxit, you can:</p>

          <ol>
            <li>Drop alpha into a Telegram DM (your own notes, a forwarded call, a link, a tweet)</li>
            <li>The system converts it into objective parameters</li>
            <li>AGENT WHAT validates it against benchmarked sources + context</li>
            <li>AGENT HOW sizes it to your preferences</li>
            <li>AGENT WHERE executes and monitors it</li>
          </ol>

          <div className="my-10 p-8 bg-gray-900 text-white rounded-xl">
            <h4 className="text-white font-medium-sans font-semibold mb-4">The "Lazy Trader" Example</h4>
            <p className="text-white">
                  You are watching a football game and your friend shares that BTC is gonna go up because blah blah blah. You trust your friend but still want a second opinion — and if that opinion turns out the same, you also want to take the trade.
                </p>
            <p className="text-white">
                  So what you could do is text Maxxit listener agent on Telegram:
                </p>
            <div className="bg-black/50 p-4 rounded-lg border border-white/20 font-mono text-green-400 my-4">
                    "Hey buy BTC now if the market looks bullish and close the trade with sufficient profit"
                </div>
            <p className="text-white">
              This will start the entire cycle where your text will be analysed alongside market data by <strong className="text-white">Agent WHAT</strong>, which will be further passed to your <strong className="text-white">Agent HOW</strong> who will decide the size, target, etc and pass it to <strong className="text-white">Agent WHERE</strong> to execute the trade & monitor for exit.
            </p>
            <div className="bg-white/10 p-4 rounded-lg mt-4">
              <p className="text-white mb-0">
                Here you <strong className="text-white">save time</strong> of the entire process and <strong className="text-white">do not miss the trade</strong>.
                  </p>
                </div>
            <p className="text-white italic mt-4 mb-0">
                  So even a "lazy trader" can participate in markets responsibly because the system handles the hard part: turning messy human input into disciplined execution.
                </p>
          </div>

          <div className="border-t border-gray-200 my-12" />

          <h2>Why Delegate Your Trades to Maxxit</h2>

          <p>
            Maxxit gives you back your <strong>time, energy, and focus</strong> — without giving up custody.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-8">
            <div className="p-5 border border-gray-200 rounded-lg hover:border-black transition-colors">
              <h4 className="font-medium-sans font-semibold text-black mb-2">Stop Paying for Noise</h4>
              <p className="text-sm text-gray-600 mb-0">
                  Instead of subscribing to 20 Telegram groups, subscribe once to Maxxit's Alpha Clubs — a compilation of benchmarked, proven sources.
                </p>
              </div>
            <div className="p-5 border border-gray-200 rounded-lg hover:border-black transition-colors">
              <h4 className="font-medium-sans font-semibold text-black mb-2">Stop Doom-Scrolling X</h4>
              <p className="text-sm text-gray-600 mb-0">
                  Maxxit scans X and Telegram for you, filters the signal from the noise, and converts it into actionable trades.
                </p>
              </div>
            <div className="p-5 border border-gray-200 rounded-lg hover:border-black transition-colors">
              <h4 className="font-medium-sans font-semibold text-black mb-2">Stop Doing Endless Research</h4>
              <p className="text-sm text-gray-600 mb-0">
                  Maxxit consumes market research and translates it into objective trade instructions you can actually execute.
                </p>
              </div>
            <div className="p-5 border border-gray-200 rounded-lg hover:border-black transition-colors">
              <h4 className="font-medium-sans font-semibold text-black mb-2">Stop Rushing to Execute</h4>
              <p className="text-sm text-gray-600 mb-0">
                  No more opening charts in panic — Maxxit acts as your always-on trading butler, executing 24/7.
                </p>
              </div>
            <div className="p-5 border border-gray-200 rounded-lg hover:border-black transition-colors">
              <h4 className="font-medium-sans font-semibold text-black mb-2">Stop Venue-Hopping</h4>
              <p className="text-sm text-gray-600 mb-0">
                  Maxxit routes trades to the best venue automatically (fees, liquidity, slippage, pairs).
                </p>
              </div>
            <div className="p-5 border border-gray-200 rounded-lg hover:border-black transition-colors">
              <h4 className="font-medium-sans font-semibold text-black mb-2">Stop Losing Sleep for Exits</h4>
              <p className="text-sm text-gray-600 mb-0">
                  Go offline — Maxxit monitors positions and manages exits timely, including liquidation prevention.
                </p>
              </div>
            </div>

          <div className="my-10 p-8 bg-black text-white rounded-xl">
            <h4 className="text-white font-medium-sans font-semibold mb-3">All of This Stays Non-Custodial</h4>
            <p className="text-white">
              <strong className="text-white">Your funds remain in your wallet.</strong>
            </p>
            <p className="text-white mb-0">
              And it's <strong className="text-white">auditable</strong>: decisions and performance trails are verifiable, not a black box.
                  </p>
                </div>

            </div>

        {/* CTA */}
        <div className="mt-16 pt-12 border-t border-gray-200 text-center">
          <h3 className="font-medium-sans text-2xl font-bold text-black mb-4">
                Ready to Let Agents Handle the Hard Part?
              </h3>
          <p className="text-gray-500 mb-8 font-medium-serif text-lg">
                Start trading smarter with Maxxit's AI-powered, non-custodial platform.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/">
              <button className="px-8 py-3 bg-black text-white font-medium-sans font-semibold hover:bg-gray-800 transition-colors rounded-full">
                    Explore Agents
                  </button>
                </Link>
                <Link href="/docs">
              <button className="px-8 py-3 border border-black text-black font-medium-sans font-semibold hover:bg-gray-100 transition-colors rounded-full">
                    Read Documentation
                  </button>
                </Link>
              </div>
            </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm text-gray-500 font-medium-sans">
            <span>© 2024 Maxxit</span>
            <div className="flex gap-6">
              <Link href="/" className="hover:text-black transition-colors">Home</Link>
              <Link href="/docs" className="hover:text-black transition-colors">Docs</Link>
            </div>
          </div>
        </footer>
        </article>

      {/* Medium-style article typography */}
      <style jsx global>{`
        .prose-medium {
          font-family: "Source Serif 4", Georgia, Cambria, "Times New Roman", Times, serif;
          font-size: 20px;
          line-height: 1.8;
          color: #292929;
        }
        
        .prose-medium p {
          margin-bottom: 1.5rem;
        }
        
        .prose-medium h2 {
          font-family: "Sora", -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 28px;
          font-weight: 700;
          color: #000;
          margin-top: 3rem;
          margin-bottom: 1rem;
          letter-spacing: -0.02em;
        }
        
        .prose-medium h3 {
          font-family: "Sora", -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 22px;
          font-weight: 600;
          color: #000;
          margin-top: 2.5rem;
          margin-bottom: 0.75rem;
        }
        
        .prose-medium h4 {
          font-family: "Sora", -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 18px;
          font-weight: 600;
          color: #000;
          margin-top: 2rem;
          margin-bottom: 0.5rem;
        }
        
        .prose-medium strong {
          font-weight: 600;
          color: inherit;
        }
        
        .prose-medium ul, .prose-medium ol {
          margin-bottom: 1.5rem;
          padding-left: 1.5rem;
        }
        
        .prose-medium li {
          margin-bottom: 0.5rem;
        }
        
        .prose-medium blockquote {
          font-style: italic;
          color: #555;
          border-left: 3px solid #000;
          padding-left: 1.5rem;
          margin: 2rem 0;
        }
        
        .prose-medium a {
          color: #000;
          text-decoration: underline;
        }
        
        .prose-medium a:hover {
          color: #555;
        }

        .prose-medium img {
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
