-- CreateEnum
CREATE TYPE "agent_status_t" AS ENUM ('DRAFT', 'PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "bill_kind_t" AS ENUM ('SUBSCRIPTION', 'INFRA_FEE', 'PROFIT_SHARE');

-- CreateEnum
CREATE TYPE "bill_status_t" AS ENUM ('CHARGED', 'FAILED');

-- CreateEnum
CREATE TYPE "deployment_status_t" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "telegram_source_t" AS ENUM ('CHANNEL', 'GROUP', 'USER');

-- CreateEnum
CREATE TYPE "venue_t" AS ENUM ('SPOT', 'GMX', 'HYPERLIQUID', 'OSTIUM', 'MULTI');

-- CreateTable
CREATE TABLE "agent_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "ct_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_telegram_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "telegram_alpha_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_telegram_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_agent_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_wallet" TEXT NOT NULL,
    "hyperliquid_agent_address" TEXT,
    "hyperliquid_agent_key_encrypted" TEXT,
    "hyperliquid_agent_key_iv" TEXT,
    "hyperliquid_agent_key_tag" TEXT,
    "ostium_agent_address" TEXT,
    "ostium_agent_key_encrypted" TEXT,
    "ostium_agent_key_iv" TEXT,
    "ostium_agent_key_tag" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_agent_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_trading_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_wallet" TEXT NOT NULL,
    "risk_tolerance" INTEGER NOT NULL DEFAULT 50,
    "trade_frequency" INTEGER NOT NULL DEFAULT 50,
    "social_sentiment_weight" INTEGER NOT NULL DEFAULT 50,
    "price_momentum_focus" INTEGER NOT NULL DEFAULT 50,
    "market_rank_priority" INTEGER NOT NULL DEFAULT 50,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_trading_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_deployments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "user_wallet" TEXT NOT NULL,
    "safe_wallet" TEXT NOT NULL,
    "status" "deployment_status_t" NOT NULL DEFAULT 'ACTIVE',
    "sub_active" BOOLEAN NOT NULL DEFAULT true,
    "sub_started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trial_ends_at" TIMESTAMPTZ(6),
    "next_billing_at" TIMESTAMPTZ(6),
    "module_enabled" BOOLEAN NOT NULL DEFAULT false,
    "module_address" TEXT,
    "enabled_venues" TEXT[] DEFAULT ARRAY['HYPERLIQUID']::TEXT[],

    CONSTRAINT "agent_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_research_institutes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_research_institutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_routing_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "signal_id" UUID,
    "requested_venues" TEXT[],
    "selected_venue" "venue_t",
    "routing_reason" TEXT,
    "checked_venues" TEXT[],
    "venue_availability" JSONB,
    "routing_duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_routing_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creator_wallet" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venue" "venue_t" NOT NULL,
    "weights" SMALLINT[],
    "apr_30d" REAL,
    "apr_90d" REAL,
    "apr_si" REAL,
    "sharpe_30d" REAL,
    "profit_receiver_address" TEXT NOT NULL,
    "proof_of_intent_message" TEXT,
    "proof_of_intent_signature" TEXT,
    "proof_of_intent_timestamp" TIMESTAMPTZ(6),
    "status" "agent_status_t" DEFAULT 'PUBLIC',

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_name" TEXT NOT NULL,
    "subject_type" TEXT,
    "subject_id" UUID,
    "payload" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trace_id" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "position_id" UUID,
    "deployment_id" UUID NOT NULL,
    "kind" "bill_kind_t" NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "asset" TEXT NOT NULL DEFAULT 'USDC',
    "status" "bill_status_t" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ct_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "x_username" TEXT NOT NULL,
    "display_name" TEXT,
    "followers_count" INTEGER,
    "impact_factor" REAL NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ct_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ct_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ct_account_id" UUID NOT NULL,
    "tweet_id" TEXT NOT NULL,
    "tweet_text" TEXT NOT NULL,
    "tweet_created_at" TIMESTAMPTZ(6) NOT NULL,
    "is_signal_candidate" BOOLEAN,
    "extracted_tokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence_score" DOUBLE PRECISION,
    "processed_for_signals" BOOLEAN NOT NULL DEFAULT false,
    "signal_type" TEXT,

    CONSTRAINT "ct_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_factor_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ct_account_id" UUID NOT NULL,
    "signal_id" UUID,
    "position_id" UUID,
    "pnl_contribution" DECIMAL(20,8),
    "weight" REAL,
    "model_version" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agent_id" UUID,

    CONSTRAINT "impact_factor_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_indicators_6h" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_symbol" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "indicators" JSONB NOT NULL,

    CONSTRAINT "market_indicators_6h_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pnl_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "pnl" DECIMAL(20,8),
    "return_pct" REAL,

    CONSTRAINT "pnl_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deployment_id" UUID NOT NULL,
    "signal_id" UUID NOT NULL,
    "venue" "venue_t" NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" DECIMAL(20,8) NOT NULL,
    "entry_price" DECIMAL(20,8) NOT NULL,
    "stop_loss" DECIMAL(20,8),
    "take_profit" DECIMAL(20,8),
    "trailing_params" JSONB,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "exit_price" DECIMAL(20,8),
    "pnl" DECIMAL(20,8),
    "entry_tx_hash" TEXT,
    "exit_tx_hash" TEXT,
    "manual_trade_id" UUID,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "current_price" DECIMAL(20,8),
    "exit_reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ostium_trade_index" INTEGER,
    "ostium_trade_id" TEXT,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_institutes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logo_url" TEXT,
    "website_url" TEXT,
    "x_handle" TEXT,
    "telegram_handle" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_institutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_signals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institute_id" UUID NOT NULL,
    "signal_text" TEXT NOT NULL,
    "source_url" TEXT,
    "extracted_tokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signal_type" TEXT,
    "extracted_leverage" INTEGER,
    "is_signal_candidate" BOOLEAN,
    "confidence_score" DOUBLE PRECISION,
    "processed_for_signals" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "venue" "venue_t" NOT NULL,
    "side" TEXT NOT NULL,
    "size_model" JSONB NOT NULL,
    "risk_model" JSONB NOT NULL,
    "source_tweets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "skipped_reason" TEXT,
    "proof_verification_error" TEXT,
    "proof_verified" BOOLEAN NOT NULL DEFAULT false,
    "executor_agreement_error" TEXT,
    "executor_agreement_message" TEXT,
    "executor_agreement_signature" TEXT,
    "executor_agreement_timestamp" TIMESTAMPTZ(6),
    "executor_agreement_verified" BOOLEAN NOT NULL DEFAULT false,
    "executor_wallet" TEXT,
    "lunarcrush_breakdown" JSONB,
    "lunarcrush_reasoning" TEXT,
    "lunarcrush_score" DOUBLE PRECISION,
    "routing_history" JSONB,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_alpha_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "telegram_user_id" TEXT NOT NULL,
    "telegram_username" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "impact_factor" REAL NOT NULL DEFAULT 0.5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_alpha_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institute_id" UUID,
    "source_name" TEXT NOT NULL,
    "telegram_id" TEXT,
    "telegram_username" TEXT,
    "source_type" "telegram_source_t" NOT NULL DEFAULT 'CHANNEL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_fetched_at" TIMESTAMPTZ(6),

    CONSTRAINT "telegram_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_id" UUID,
    "alpha_user_id" UUID,
    "message_id" TEXT NOT NULL,
    "message_text" TEXT NOT NULL,
    "message_created_at" TIMESTAMPTZ(6) NOT NULL,
    "sender_id" TEXT,
    "sender_username" TEXT,
    "is_signal_candidate" BOOLEAN,
    "extracted_tokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence_score" DOUBLE PRECISION,
    "signal_type" TEXT,
    "processed_for_signals" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "llm_signature" TEXT,
    "llm_raw_output" TEXT,
    "llm_model_used" TEXT,
    "llm_chain_id" INTEGER,
    "llm_reasoning" TEXT,

    CONSTRAINT "telegram_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_trades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "telegram_user_id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "message_id" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "parsed_intent" JSONB NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMPTZ(6),
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "executed_at" TIMESTAMPTZ(6),
    "signal_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "telegram_user_id" TEXT NOT NULL,
    "telegram_username" TEXT,
    "first_name" TEXT,
    "deployment_id" UUID NOT NULL,
    "link_code" TEXT,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "telegram_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_registry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chain" TEXT NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "token_address" TEXT NOT NULL,
    "preferred_router" TEXT,

    CONSTRAINT "token_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_hyperliquid_wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_wallet" TEXT NOT NULL,
    "agent_address" TEXT NOT NULL,
    "agent_private_key_encrypted" TEXT NOT NULL,
    "agent_key_iv" TEXT NOT NULL,
    "agent_key_tag" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),
    "is_approved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_hyperliquid_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_markets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venue" "venue_t" NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "market_name" TEXT NOT NULL,
    "market_index" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "min_position" DECIMAL(20,8),
    "max_leverage" INTEGER,
    "group" TEXT,
    "current_price" DECIMAL(20,8),
    "last_synced" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "venue_markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ostium_available_pairs" (
    "id" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "max_leverage" DOUBLE PRECISION,
    "maker_max_leverage" DOUBLE PRECISION,
    "group" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ostium_available_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_routing_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID,
    "venue_priority" TEXT[],
    "routing_strategy" TEXT NOT NULL DEFAULT 'FIRST_AVAILABLE',
    "failover_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_routing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_routing_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "signal_id" UUID NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "requested_venue" "venue_t" NOT NULL,
    "selected_venue" "venue_t" NOT NULL,
    "routing_reason" TEXT NOT NULL,
    "checked_venues" TEXT[],
    "venue_availability" JSONB NOT NULL,
    "routing_duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_routing_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues_status" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venue" "venue_t" NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "min_size" DECIMAL(20,8),
    "tick_size" DECIMAL(20,8),
    "slippage_limit_bps" INTEGER,

    CONSTRAINT "venues_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_pool" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "address" TEXT NOT NULL,
    "private_key" TEXT NOT NULL,
    "assigned_to_user_wallet" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_pool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_accounts_agent_id_idx" ON "agent_accounts"("agent_id");

-- CreateIndex
CREATE INDEX "agent_accounts_ct_account_id_idx" ON "agent_accounts"("ct_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_accounts_agent_id_ct_account_id_key" ON "agent_accounts"("agent_id", "ct_account_id");

-- CreateIndex
CREATE INDEX "agent_telegram_users_agent_id_idx" ON "agent_telegram_users"("agent_id");

-- CreateIndex
CREATE INDEX "agent_telegram_users_telegram_alpha_user_id_idx" ON "agent_telegram_users"("telegram_alpha_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_telegram_users_agent_id_telegram_alpha_user_id_key" ON "agent_telegram_users"("agent_id", "telegram_alpha_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_agent_addresses_user_wallet_key" ON "user_agent_addresses"("user_wallet");

-- CreateIndex
CREATE UNIQUE INDEX "user_agent_addresses_hyperliquid_agent_address_key" ON "user_agent_addresses"("hyperliquid_agent_address");

-- CreateIndex
CREATE UNIQUE INDEX "user_agent_addresses_ostium_agent_address_key" ON "user_agent_addresses"("ostium_agent_address");

-- CreateIndex
CREATE INDEX "user_agent_addresses_user_wallet_idx" ON "user_agent_addresses"("user_wallet");

-- CreateIndex
CREATE INDEX "user_agent_addresses_hyperliquid_agent_address_idx" ON "user_agent_addresses"("hyperliquid_agent_address");

-- CreateIndex
CREATE INDEX "user_agent_addresses_ostium_agent_address_idx" ON "user_agent_addresses"("ostium_agent_address");

-- CreateIndex
CREATE UNIQUE INDEX "user_trading_preferences_user_wallet_key" ON "user_trading_preferences"("user_wallet");

-- CreateIndex
CREATE INDEX "user_trading_preferences_user_wallet_idx" ON "user_trading_preferences"("user_wallet");

-- CreateIndex
CREATE INDEX "agent_deployments_agent_id_idx" ON "agent_deployments"("agent_id");

-- CreateIndex
CREATE INDEX "agent_deployments_user_wallet_idx" ON "agent_deployments"("user_wallet");

-- CreateIndex
CREATE INDEX "agent_deployments_user_wallet_agent_id_idx" ON "agent_deployments"("user_wallet", "agent_id");

-- CreateIndex
CREATE INDEX "agent_research_institutes_agent_id_idx" ON "agent_research_institutes"("agent_id");

-- CreateIndex
CREATE INDEX "agent_research_institutes_institute_id_idx" ON "agent_research_institutes"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_research_institutes_agent_id_institute_id_key" ON "agent_research_institutes"("agent_id", "institute_id");

-- CreateIndex
CREATE INDEX "idx_routing_history_created" ON "agent_routing_history"("created_at");

-- CreateIndex
CREATE INDEX "idx_routing_history_signal" ON "agent_routing_history"("signal_id");

-- CreateIndex
CREATE INDEX "idx_routing_history_venue" ON "agent_routing_history"("selected_venue");

-- CreateIndex
CREATE INDEX "audit_logs_event_name_occurred_at_idx" ON "audit_logs"("event_name", "occurred_at");

-- CreateIndex
CREATE INDEX "billing_events_deployment_id_occurred_at_idx" ON "billing_events"("deployment_id", "occurred_at");

-- CreateIndex
CREATE INDEX "billing_events_kind_occurred_at_idx" ON "billing_events"("kind", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "ct_accounts_x_username_key" ON "ct_accounts"("x_username");

-- CreateIndex
CREATE INDEX "ct_accounts_is_active_idx" ON "ct_accounts"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ct_posts_tweet_id_key" ON "ct_posts"("tweet_id");

-- CreateIndex
CREATE INDEX "ct_posts_ct_account_id_idx" ON "ct_posts"("ct_account_id");

-- CreateIndex
CREATE INDEX "ct_posts_is_signal_candidate_processed_for_signals_idx" ON "ct_posts"("is_signal_candidate", "processed_for_signals");

-- CreateIndex
CREATE INDEX "impact_factor_history_ct_account_id_occurred_at_idx" ON "impact_factor_history"("ct_account_id", "occurred_at");

-- CreateIndex
CREATE INDEX "market_indicators_6h_token_symbol_idx" ON "market_indicators_6h"("token_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "market_indicators_6h_token_symbol_window_start_key" ON "market_indicators_6h"("token_symbol", "window_start");

-- CreateIndex
CREATE INDEX "pnl_snapshots_agent_id_day_idx" ON "pnl_snapshots"("agent_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "pnl_snapshots_deployment_id_day_key" ON "pnl_snapshots"("deployment_id", "day");

-- CreateIndex
CREATE INDEX "positions_deployment_id_opened_at_idx" ON "positions"("deployment_id", "opened_at");

-- CreateIndex
CREATE INDEX "positions_signal_id_idx" ON "positions"("signal_id");

-- CreateIndex
CREATE INDEX "positions_source_idx" ON "positions"("source");

-- CreateIndex
CREATE INDEX "positions_status_idx" ON "positions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "positions_deployment_id_signal_id_key" ON "positions"("deployment_id", "signal_id");

-- CreateIndex
CREATE UNIQUE INDEX "research_institutes_name_key" ON "research_institutes"("name");

-- CreateIndex
CREATE INDEX "research_signals_institute_id_created_at_idx" ON "research_signals"("institute_id", "created_at");

-- CreateIndex
CREATE INDEX "research_signals_is_signal_candidate_idx" ON "research_signals"("is_signal_candidate");

-- CreateIndex
CREATE INDEX "research_signals_processed_for_signals_idx" ON "research_signals"("processed_for_signals");

-- CreateIndex
CREATE INDEX "signals_agent_id_created_at_idx" ON "signals"("agent_id", "created_at");

-- CreateIndex
CREATE INDEX "signals_lunarcrush_score_idx" ON "signals"("lunarcrush_score");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_alpha_users_telegram_user_id_key" ON "telegram_alpha_users"("telegram_user_id");

-- CreateIndex
CREATE INDEX "telegram_alpha_users_is_active_idx" ON "telegram_alpha_users"("is_active");

-- CreateIndex
CREATE INDEX "telegram_alpha_users_telegram_user_id_idx" ON "telegram_alpha_users"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_sources_source_name_key" ON "telegram_sources"("source_name");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_sources_telegram_id_key" ON "telegram_sources"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_sources_telegram_username_key" ON "telegram_sources"("telegram_username");

-- CreateIndex
CREATE INDEX "telegram_sources_is_active_idx" ON "telegram_sources"("is_active");

-- CreateIndex
CREATE INDEX "telegram_sources_institute_id_idx" ON "telegram_sources"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_posts_message_id_key" ON "telegram_posts"("message_id");

-- CreateIndex
CREATE INDEX "telegram_posts_source_id_idx" ON "telegram_posts"("source_id");

-- CreateIndex
CREATE INDEX "telegram_posts_alpha_user_id_idx" ON "telegram_posts"("alpha_user_id");

-- CreateIndex
CREATE INDEX "telegram_posts_is_signal_candidate_idx" ON "telegram_posts"("is_signal_candidate");

-- CreateIndex
CREATE INDEX "telegram_posts_message_created_at_idx" ON "telegram_posts"("message_created_at");

-- CreateIndex
CREATE INDEX "telegram_posts_processed_for_signals_idx" ON "telegram_posts"("processed_for_signals");

-- CreateIndex
CREATE INDEX "telegram_trades_deployment_id_idx" ON "telegram_trades"("deployment_id");

-- CreateIndex
CREATE INDEX "telegram_trades_status_idx" ON "telegram_trades"("status");

-- CreateIndex
CREATE INDEX "telegram_trades_telegram_user_id_idx" ON "telegram_trades"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_users_telegram_user_id_key" ON "telegram_users"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_users_link_code_key" ON "telegram_users"("link_code");

-- CreateIndex
CREATE INDEX "telegram_users_deployment_id_idx" ON "telegram_users"("deployment_id");

-- CreateIndex
CREATE UNIQUE INDEX "token_registry_chain_token_symbol_key" ON "token_registry"("chain", "token_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "user_hyperliquid_wallets_user_wallet_key" ON "user_hyperliquid_wallets"("user_wallet");

-- CreateIndex
CREATE UNIQUE INDEX "user_hyperliquid_wallets_agent_address_key" ON "user_hyperliquid_wallets"("agent_address");

-- CreateIndex
CREATE INDEX "user_hyperliquid_wallets_agent_address_idx" ON "user_hyperliquid_wallets"("agent_address");

-- CreateIndex
CREATE INDEX "user_hyperliquid_wallets_user_wallet_idx" ON "user_hyperliquid_wallets"("user_wallet");

-- CreateIndex
CREATE INDEX "venue_markets_last_synced_idx" ON "venue_markets"("last_synced");

-- CreateIndex
CREATE INDEX "venue_markets_venue_is_active_idx" ON "venue_markets"("venue", "is_active");

-- CreateIndex
CREATE INDEX "venue_markets_venue_token_symbol_idx" ON "venue_markets"("venue", "token_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "venue_markets_venue_token_symbol_key" ON "venue_markets"("venue", "token_symbol");

-- CreateIndex
CREATE INDEX "ostium_available_pairs_group_idx" ON "ostium_available_pairs"("group");

-- CreateIndex
CREATE UNIQUE INDEX "venue_routing_config_agent_id_key" ON "venue_routing_config"("agent_id");

-- CreateIndex
CREATE INDEX "venue_routing_config_agent_id_idx" ON "venue_routing_config"("agent_id");

-- CreateIndex
CREATE INDEX "venue_routing_history_created_at_idx" ON "venue_routing_history"("created_at");

-- CreateIndex
CREATE INDEX "venue_routing_history_signal_id_idx" ON "venue_routing_history"("signal_id");

-- CreateIndex
CREATE INDEX "venue_routing_history_token_symbol_selected_venue_idx" ON "venue_routing_history"("token_symbol", "selected_venue");

-- CreateIndex
CREATE INDEX "venues_status_venue_token_symbol_idx" ON "venues_status"("venue", "token_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "venues_status_venue_token_symbol_key" ON "venues_status"("venue", "token_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_pool_address_key" ON "wallet_pool"("address");

-- AddForeignKey
ALTER TABLE "agent_accounts" ADD CONSTRAINT "agent_accounts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_accounts" ADD CONSTRAINT "agent_accounts_ct_account_id_fkey" FOREIGN KEY ("ct_account_id") REFERENCES "ct_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_telegram_users" ADD CONSTRAINT "agent_telegram_users_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_telegram_users" ADD CONSTRAINT "agent_telegram_users_telegram_alpha_user_id_fkey" FOREIGN KEY ("telegram_alpha_user_id") REFERENCES "telegram_alpha_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_research_institutes" ADD CONSTRAINT "agent_research_institutes_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_research_institutes" ADD CONSTRAINT "agent_research_institutes_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "research_institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_routing_history" ADD CONSTRAINT "agent_routing_history_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "agent_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ct_posts" ADD CONSTRAINT "ct_posts_ct_account_id_fkey" FOREIGN KEY ("ct_account_id") REFERENCES "ct_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_factor_history" ADD CONSTRAINT "impact_factor_history_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_factor_history" ADD CONSTRAINT "impact_factor_history_ct_account_id_fkey" FOREIGN KEY ("ct_account_id") REFERENCES "ct_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_factor_history" ADD CONSTRAINT "impact_factor_history_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_factor_history" ADD CONSTRAINT "impact_factor_history_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pnl_snapshots" ADD CONSTRAINT "pnl_snapshots_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pnl_snapshots" ADD CONSTRAINT "pnl_snapshots_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "agent_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "agent_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_manual_trade_id_fkey" FOREIGN KEY ("manual_trade_id") REFERENCES "telegram_trades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_signals" ADD CONSTRAINT "research_signals_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "research_institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_sources" ADD CONSTRAINT "telegram_sources_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "research_institutes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_posts" ADD CONSTRAINT "telegram_posts_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "telegram_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_posts" ADD CONSTRAINT "telegram_posts_alpha_user_id_fkey" FOREIGN KEY ("alpha_user_id") REFERENCES "telegram_alpha_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_trades" ADD CONSTRAINT "telegram_trades_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "agent_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_trades" ADD CONSTRAINT "telegram_trades_telegram_user_id_fkey" FOREIGN KEY ("telegram_user_id") REFERENCES "telegram_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_users" ADD CONSTRAINT "telegram_users_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "agent_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_routing_config" ADD CONSTRAINT "venue_routing_config_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_routing_history" ADD CONSTRAINT "venue_routing_history_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

