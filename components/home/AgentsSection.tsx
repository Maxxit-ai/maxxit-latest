import Link from 'next/link';
import { AgentSummary } from './types';
import { useState } from 'react';
import { ArrowRight, Zap, Wallet, Copy, Check, CheckCircle, AlertCircle, Settings, Plus, Activity } from 'lucide-react';
import { OstiumDelegationModal } from '../OstiumDelegationModal';
import { OstiumUsdcApprovalModal } from '../OstiumUsdcApprovalModal';

interface AgentsSectionProps {
  agents: AgentSummary[];
  loading: boolean;
  error: string | null;
  onCardClick: (agent: AgentSummary) => void;
  onDeployClick: (agent: AgentSummary) => void;
  userAgentAddresses?: {
    hyperliquid?: string | null;
    ostium?: string | null;
  } | null;
  agentDeployments?: Record<string, string[]>; // agentId -> enabled_venues[]
  ostiumDelegationStatus?: {
    hasDelegation: boolean;
    delegatedAddress: string;
    isDelegatedToAgent: boolean;
  } | null;
  ostiumUsdcAllowance?: {
    usdcAllowance: number;
    hasApproval: boolean;
  } | null;
  fromHome?: boolean;
  creditBalance?: number; // User's current credit balance
  userWallet?: string; // User's wallet address for creator check
}

const AgentsSection = ({ agents, loading, error, onCardClick, onDeployClick, userAgentAddresses, agentDeployments = {}, ostiumDelegationStatus, ostiumUsdcAllowance, fromHome = true, creditBalance = 0, userWallet = '' }: AgentsSectionProps) => {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [showUsdcApprovalModal, setShowUsdcApprovalModal] = useState(false);

  const handleCopyAddress = (address: string, type: 'hyperliquid' | 'ostium') => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(`${type}-${address}`);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleDelegationComplete = () => {
    setShowDelegationModal(false);
    // In a real implementation, you might want to refresh the delegation status here
    // For now, we'll just close the modal
  };

  const handleUsdcApprovalComplete = () => {
    setShowUsdcApprovalModal(false);
    // In a real implementation, you might want to refresh the USDC allowance here
    // For now, we'll just close the modal
  };

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  return (
    <>
      <section id="agents" className={`border-[var(--border)] bg-[var(--bg-deep)] ${fromHome ? 'border-t-2 py-12 sm:py-16 md:py-20 lg:py-24' : 'border-t-0 py-8'}`}>
        <style jsx>{`
        @keyframes borderScan {
          0% {
            clip-path: polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%);
          }
          25% {
            clip-path: polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%);
          }
          50% {
            clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 100% 100%);
          }
          75% {
            clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%);
          }
          100% {
            clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%);
          }
        }

        @keyframes fillUp {
          0% {
            transform: translateY(100%) scaleY(0.8);
            opacity: 0.9;
          }
          50% {
            transform: translateY(50%) scaleY(1);
            opacity: 1;
          }
          100% {
            transform: translateY(0%) scaleY(1);
            opacity: 1;
          }
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%) translateY(-50%) skewX(-20deg);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateX(300%) translateY(-50%) skewX(-20deg);
            opacity: 0;
          }
        }

        @keyframes borderPulse {
          0%, 100% {
            border-color: var(--accent);
            box-shadow: 0 0 0 0 rgba(0, 255, 136, 0);
          }
          50% {
            border-color: var(--accent-dim);
            box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.1);
          }
        }

        @keyframes cardEnter {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .card-enter {
          animation: cardEnter 0.6s ease-out forwards;
          opacity: 0;
        }

        .border-scan {
          position: relative;
        }

        .border-scan::before {
          content: '';
          position: absolute;
          inset: -2px;
          border: 2px solid var(--accent);
          clip-path: polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%);
          pointer-events: none;
        }

        .border-scan:hover::before {
          animation: borderScan 1.5s ease-in-out forwards;
        }

        .button-animated {
          position: relative;
          overflow: hidden;
          background: var(--bg-elevated);
          isolation: isolate;
          transition: border-color 0.3s ease, color 0.3s ease 0.15s;
        }

        .button-animated::before {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 100%;
          background: linear-gradient(
            180deg,
            var(--accent-dim) 0%,
            var(--accent) 50%,
            var(--accent-dim) 100%
          );
          transform: translateY(100%) scaleY(0.8);
          transform-origin: bottom;
          transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          z-index: 0;
        }

        .button-animated::after {
          content: '';
          position: absolute;
          top: 50%;
          left: -50%;
          width: 50%;
          height: 200%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.4) 50%,
            transparent 100%
          );
          transform: translateX(-100%) translateY(-50%) skewX(-25deg);
          z-index: 1;
          pointer-events: none;
        }

        .button-animated:hover::before {
          transform: translateY(0%) scaleY(1);
        }

        .button-animated:hover::after {
          animation: shimmer 0.8s ease-out 0.2s;
        }

        .button-animated:hover {
          border-color: var(--accent);
          color: var(--bg-deep);
        }

        .button-animated:active {
          transform: scale(0.98);
        }

        .button-animated > * {
          position: relative;
          z-index: 2;
          transition: transform 0.3s ease;
        }

        .button-animated:hover > * {
          transform: scale(1.02);
        }

        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>

        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {fromHome && (
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 sm:gap-6 mb-6 sm:mb-8 pb-6 sm:pb-8 border-b-2 border-[var(--border)]">
              <div>
                <p className="data-label mb-3 sm:mb-4">JOIN NOW</p>
                <h2 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl">
                  <span className="text-accent">ALPHA</span> CLUBS
                </h2>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 sm:mt-2">
                  Each club has unique alpha sources and trading strategies
                </p>
              </div>
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="border-2 border-[var(--border)] px-3 sm:px-4 py-1.5 sm:py-2 bg-[var(--bg-surface)]">
                  <span className="text-xs sm:text-sm text-[var(--text-muted)] font-mono">
                    {!loading && `${agents.length} AVAILABLE`}
                  </span>
                </div>
                <Link href="/create-agent">
                  <button className="group px-3 sm:px-4 py-1.5 sm:py-2 border-2 border-[var(--border)] bg-[var(--bg-surface)] text-xs sm:text-sm font-bold hover:border-accent hover:text-accent hover:bg-accent/5 transition-all flex items-center gap-2">
                    <Plus className="group-hover:rotate-12 transition-transform w-3 h-3 sm:w-3.5 sm:h-3.5" size={14} />
                    CREATE CLUB
                  </button>
                </Link>
              </div>
            </div>
          )}



          {/* Trading Wallets Display - Single Location */}
          {userAgentAddresses && (userAgentAddresses.hyperliquid || userAgentAddresses.ostium) && (
            <div className="mb-6 sm:mb-8 p-3 sm:p-4 border border-[var(--accent)]/40 bg-[var(--accent)]/5">
              <p className="data-label mb-2 sm:mb-3 text-xs sm:text-sm">YOUR TRADING WALLETS</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                {/* {userAgentAddresses.hyperliquid && (
                  <div className="flex items-center justify-between gap-3 p-3 bg-[var(--bg-deep)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 border-2 border-[var(--accent)]/60 flex items-center justify-center flex-shrink-0">
                        <Wallet className="w-4 h-4 text-[var(--accent)]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--accent)] uppercase">HYPERLIQUID</p>
                        <p className="text-xs font-mono text-[var(--text-primary)] truncate" title={userAgentAddresses.hyperliquid}>
                          {formatAddress(userAgentAddresses.hyperliquid)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopyAddress(userAgentAddresses.hyperliquid!, 'hyperliquid')}
                      className="p-2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors flex-shrink-0 border border-[var(--border)] hover:border-[var(--accent)]/50"
                      title="Copy full address"
                    >
                      {copiedAddress === `hyperliquid-${userAgentAddresses.hyperliquid}` ? (
                        <Check className="w-4 h-4 text-[var(--accent)]" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )} */}

                {userAgentAddresses.ostium && (
                  <div className="flex items-center justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-[var(--bg-deep)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-[var(--accent)]/60 flex items-center justify-center flex-shrink-0">
                        <Wallet className="w-3 h-3 sm:w-4 sm:h-4 text-[var(--accent)]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] sm:text-xs font-bold text-[var(--accent)] uppercase">OSTIUM</p>
                        <p className="text-[10px] sm:text-xs font-mono text-[var(--text-primary)] truncate" title={userAgentAddresses.ostium}>
                          {formatAddress(userAgentAddresses.ostium)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopyAddress(userAgentAddresses.ostium!, 'ostium')}
                      className="p-1.5 sm:p-2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors flex-shrink-0 border border-[var(--border)] hover:border-[var(--accent)]/50"
                      title="Copy full address"
                    >
                      {copiedAddress === `ostium-${userAgentAddresses.ostium}` ? (
                        <Check className="w-3 h-3 sm:w-4 sm:h-4 text-[var(--accent)]" />
                      ) : (
                        <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ostium Delegation Status Card */}
          {userAgentAddresses?.ostium && (
            <div className="mb-6 sm:mb-8 p-3 sm:p-4 border border-[var(--border)] bg-[var(--bg-surface)]">
              <p className="data-label mb-2 sm:mb-3 text-xs sm:text-sm">OSTIUM STATUS</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {/* Delegation Status */}
                <div className="p-2 sm:p-3 bg-[var(--bg-deep)] border border-[var(--border)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] sm:text-xs font-bold text-[var(--text-muted)] uppercase">Delegation</span>
                    {ostiumDelegationStatus === null || ostiumDelegationStatus === undefined ? (
                      <Activity className="w-3 h-3 sm:w-4 sm:h-4 text-[var(--accent)] animate-spin" />
                    ) : ostiumDelegationStatus.isDelegatedToAgent ? (
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-[var(--accent)]" />
                    ) : (
                      <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-[var(--danger)]" />
                    )}
                  </div>
                  <p className="text-xs sm:text-sm font-mono text-[var(--text-primary)]">
                    {ostiumDelegationStatus === null || ostiumDelegationStatus === undefined
                      ? 'Checking...'
                      : ostiumDelegationStatus.isDelegatedToAgent
                        ? 'Delegated to agent'
                        : ostiumDelegationStatus.hasDelegation
                          ? 'Delegated to other address'
                          : 'Not delegated'}
                  </p>
                  {ostiumDelegationStatus?.delegatedAddress && (
                    <p className="text-[10px] sm:text-xs font-mono text-[var(--text-muted)] mt-1 truncate" title={ostiumDelegationStatus.delegatedAddress}>
                      {formatAddress(ostiumDelegationStatus.delegatedAddress)}
                    </p>
                  )}
                  {ostiumDelegationStatus !== null && ostiumDelegationStatus !== undefined && !ostiumDelegationStatus.isDelegatedToAgent && (
                    <button
                      onClick={() => setShowDelegationModal(true)}
                      className="mt-2 sm:mt-3 w-full py-1.5 sm:py-2 px-2 sm:px-3 bg-[var(--accent)] text-[var(--bg-deep)] text-[10px] sm:text-xs font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-1"
                    >
                      <Settings className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      SETUP DELEGATION
                    </button>
                  )}
                </div>

                {/* USDC Allowance */}
                <div className="p-2 sm:p-3 bg-[var(--bg-deep)] border border-[var(--border)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] sm:text-xs font-bold text-[var(--text-muted)] uppercase">USDC Allowance</span>
                    {ostiumUsdcAllowance === null || ostiumUsdcAllowance === undefined ? (
                      <Activity className="w-3 h-3 sm:w-4 sm:h-4 text-[var(--accent)] animate-spin" />
                    ) : ostiumUsdcAllowance.hasApproval ? (
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-[var(--accent)]" />
                    ) : (
                      <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-[var(--danger)]" />
                    )}
                  </div>
                  <p className="text-xs sm:text-sm font-mono text-[var(--text-primary)]">
                    {ostiumUsdcAllowance === null || ostiumUsdcAllowance === undefined
                      ? 'Checking...'
                      : `$${ostiumUsdcAllowance.usdcAllowance.toLocaleString()}`}
                  </p>
                  <p className="text-[10px] sm:text-xs text-[var(--text-muted)] mt-1">
                    {ostiumUsdcAllowance === null || ostiumUsdcAllowance === undefined
                      ? 'Checking status...'
                      : ostiumUsdcAllowance.hasApproval
                        ? 'Sufficient for trading'
                        : 'Insufficient for trading'}
                  </p>
                  {ostiumUsdcAllowance !== null && ostiumUsdcAllowance !== undefined && !ostiumUsdcAllowance.hasApproval && (
                    <button
                      onClick={() => setShowUsdcApprovalModal(true)}
                      className="mt-2 sm:mt-3 w-full py-1.5 sm:py-2 px-2 sm:px-3 bg-[var(--accent)] text-[var(--bg-deep)] text-[10px] sm:text-xs font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-1"
                    >
                      <Settings className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      APPROVE USDC
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border-2 border-[var(--border)] p-8 bg-[var(--bg-surface)] animate-pulse">
                  <div className="h-6 w-3/4 bg-[var(--border)] mb-4" />
                  <div className="h-4 w-1/2 bg-[var(--border)] mb-8" />
                  <div className="h-16 w-1/3 bg-[var(--border)]" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="border-2 border-[var(--danger)] p-12 text-center bg-[var(--bg-surface)]">
              <p className="text-[var(--danger)] mb-4 font-mono font-bold">ERROR: {error}</p>
            </div>
          ) : agents.length === 0 ? (
            <div className="border-2 border-[var(--border)] p-16 text-center bg-[var(--bg-surface)]">
              <p className="font-display text-3xl mb-4">NO CLUBS YET</p>
              <p className="text-[var(--text-secondary)] mb-8">Be the first to create one</p>
              <Link href="/create-agent">
                <button className="px-8 py-4 bg-accent text-[var(--bg-deep)] font-bold border-2 border-accent hover:bg-[var(--bg-deep)] hover:text-accent transition-all">
                  CREATE CLUB →
                </button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6">
              {agents.map((agent, i) => (
                <div
                  key={agent.id}
                  onClick={() => onCardClick(agent)}
                  onMouseEnter={() => setHoveredCard(agent.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="border-scan flex h-full flex-col justify-between border-2 border-[var(--border)] p-3 sm:p-4 md:p-5 lg:p-6 cursor-pointer bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-all group card-enter relative overflow-hidden"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  {/* Decorative gradient overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                  {/* Subtle grid pattern */}
                  <div className="absolute inset-0 opacity-[0.02] group-hover:opacity-[0.04] transition-opacity pointer-events-none" style={{
                    backgroundImage: 'linear-gradient(rgba(0, 255, 136, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 136, 0.1) 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                  }} />

                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-2 sm:mb-3 md:mb-4">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="font-display text-base sm:text-lg md:text-xl group-hover:text-accent transition-colors mb-1 sm:mb-2 truncate">
                          {agent.name}
                        </h3>
                        {/* <div className="flex items-center gap-2 flex-wrap">
                          {agent.venue === 'MULTI' ? (
                            <span className="text-xs px-2 py-1 border-2 border-accent text-accent bg-accent/10 font-bold">
                              MULTI-VENUE
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)] font-mono uppercase">
                              {agent.venue}
                            </span>
                          )}
                        </div> */}
                      </div>
                      <div className="border-2 border-[var(--border)] px-1 sm:px-1.5 md:px-2 py-0.5 sm:py-1 bg-[var(--bg-elevated)] flex-shrink-0 ml-1 sm:ml-2">
                        <span className="text-[var(--text-muted)] text-[10px] sm:text-xs font-mono font-bold">
                          #{String(i + 1).padStart(2, '0')}
                        </span>
                      </div>
                    </div>

                    {/* Description Section */}
                    {agent.description && (
                      <div className="mb-2 sm:mb-3 md:mb-4">
                        <p className="text-[10px] sm:text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed opacity-80">
                          {agent.description}
                        </p>
                      </div>
                    )}


                    {/* Metrics Section - Unified Design */}
                    <div className="flex-1 flex flex-col justify-center">
                      {/* Price Section */}
                      <div className="mb-3 sm:mb-4 md:mb-5 pb-2 sm:pb-3 md:pb-4 border-b border-[#ededed]/20">
                        <div className="flex items-center justify-between">
                          <p className="text-[8px] sm:text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] opacity-70">
                            COUNCIL PRICE
                          </p>
                          <p className={`text-[10px] sm:text-xs md:text-sm font-mono font-bold ${agent.totalCost && agent.totalCost > 0 ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                            {agent.totalCost && agent.totalCost > 0
                              ? `${agent.totalCost.toFixed(0)} CREDS`
                              : 'FREE'}
                          </p>
                        </div>
                      </div>
                      {/* Primary Metric - 30D Return */}
                      <div className="mb-2 sm:mb-3 md:mb-4">
                        <p className="text-[8px] sm:text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1 sm:mb-1.5 opacity-70">
                          30D RETURN
                        </p>
                        <p
                          className={`text-lg sm:text-2xl md:text-3xl font-display leading-none font-bold ${agent.apr30d && agent.apr30d > 0
                            ? 'text-accent'
                            : agent.apr30d && agent.apr30d < 0
                              ? 'text-[var(--danger)]'
                              : 'text-[var(--text-muted)]'
                            }`}
                        >
                          {agent.apr30d != null
                            ? `${agent.apr30d > 0 ? '+' : ''}${agent.apr30d.toFixed(1)}%`
                            : '—'}
                        </p>
                      </div>

                      {/* Secondary Metrics */}
                      <div className="flex gap-1.5 sm:gap-2 md:gap-3">
                        {agent.sharpe30d != null && (
                          <div className="flex-1 bg-[var(--bg-deep)]/60 px-1.5 sm:px-2 md:px-3 py-1.5 sm:py-2 md:py-2.5 rounded-sm border border-[var(--border)]/20 group-hover:border-[var(--accent)]/20 transition-colors">
                            <p className="text-[8px] sm:text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-0.5 sm:mb-1 opacity-70">
                              SHARPE
                            </p>
                            <p className="font-mono font-bold text-accent text-xs sm:text-sm md:text-base leading-none">
                              {agent.sharpe30d.toFixed(2)}
                            </p>
                          </div>
                        )}
                        {agent.apr90d != null && (
                          <div className="flex-1 bg-[var(--bg-deep)]/60 px-1.5 sm:px-2 md:px-3 py-1.5 sm:py-2 md:py-2.5 rounded-sm border border-[var(--border)]/20 group-hover:border-[var(--accent)]/20 transition-colors">
                            <p className="text-[8px] sm:text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-0.5 sm:mb-1 opacity-70">
                              90D
                            </p>
                            <p className={`font-mono font-bold text-xs sm:text-sm md:text-base leading-none ${agent.apr90d > 0 ? 'text-accent' : agent.apr90d < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}`}>
                              {agent.apr90d > 0 ? '+' : ''}{agent.apr90d.toFixed(1)}%
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Button Section */}
                    <div className="pt-3 sm:pt-4 md:pt-6">
                      {(() => {
                        const agentCost = agent.totalCost || 0;
                        const isWalletConnected = userWallet && userWallet.trim() !== '';
                        const isCreator = isWalletConnected && agent.creatorWallet &&
                          userWallet.toLowerCase() === agent.creatorWallet.toLowerCase();
                        const alreadyDeployed = agentDeployments[agent.id]?.length > 0;
                        const hasInsufficientCredits = isWalletConnected && !isCreator && !alreadyDeployed && agentCost > 0 && creditBalance < agentCost;

                        return (
                          <button
                            onMouseEnter={() => setHoveredButton(agent.id)}
                            onMouseLeave={() => setHoveredButton(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!hasInsufficientCredits) {
                                onDeployClick(agent);
                              }
                            }}
                            disabled={hasInsufficientCredits || false}
                            className={`w-full py-2 sm:py-2.5 md:py-3 border-2 text-[10px] sm:text-xs md:text-sm font-bold flex items-center justify-center gap-1 sm:gap-2 relative transition-all ${hasInsufficientCredits
                              ? 'border-red-500/50 bg-red-500/5 text-red-500 cursor-not-allowed opacity-70'
                              : 'button-animated border-[var(--border)] bg-[var(--bg-elevated)] group/btn'
                              }`}
                          >
                            {!isWalletConnected ? (
                              <>
                                <Wallet className="relative z-10 w-3 h-3 sm:w-4 sm:h-4" />
                                <span className="relative z-10 font-bold">CONNECT WALLET</span>
                              </>
                            ) : alreadyDeployed ? (
                              <>
                                <CheckCircle className="relative z-10 w-3 h-3 sm:w-4 sm:h-4" />
                                <span className="relative z-10 font-bold">JOINED</span>
                              </>
                            ) : hasInsufficientCredits ? (
                              <>
                                <AlertCircle className="relative z-10 w-3 h-3 sm:w-4 sm:h-4" />
                                <span className="relative z-10 font-bold hidden sm:inline">INSUFFICIENT CREDITS</span>
                                <span className="relative z-10 font-bold sm:hidden">NO CREDITS</span>
                              </>
                            ) : isCreator ? (
                              <>
                                <span className="relative z-10 font-bold hidden sm:inline">JOIN CLUB (FREE)</span>
                                <span className="relative z-10 font-bold sm:hidden">JOIN (FREE)</span>
                                <ArrowRight
                                  className={`relative z-10 transition-transform w-3 h-3 sm:w-4 sm:h-4 ${hoveredButton === agent.id ? 'translate-x-1' : ''}`}
                                />
                              </>
                            ) : (
                              <>
                                <span className="relative z-10 font-bold">JOIN CLUB</span>
                                <ArrowRight
                                  className={`relative z-10 transition-transform w-3 h-3 sm:w-4 sm:h-4 ${hoveredButton === agent.id ? 'translate-x-1' : ''}`}
                                />
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Ostium Delegation Modal */}
      {showDelegationModal && (
        <OstiumDelegationModal
          agentAddress={userAgentAddresses?.ostium || ''}
          onClose={() => setShowDelegationModal(false)}
          onSuccess={handleDelegationComplete}
        />
      )}

      {/* Ostium USDC Approval Modal */}
      {showUsdcApprovalModal && (
        <OstiumUsdcApprovalModal
          onClose={() => setShowUsdcApprovalModal(false)}
          onSuccess={handleUsdcApprovalComplete}
        />
      )}
    </>
  );
};

export default AgentsSection;


