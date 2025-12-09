# LunarCrush Score - Simple Flow Guide

## 🎯 What Does This Do?

Takes a **token** (like BTC) and a **tweet confidence score** (from EigenAI), then calculates:
- ✅ Should we trade? (Yes/No)
- 💰 How much to invest? (0-10% of capital)

### Why the math steps matter (quick intuition)
- **Normalize tweet confidence (0→1 to -1→+1)**: so it shares the same scale as LunarCrush scores and can be blended; 0.5 becomes neutral (0), above 0.5 is positive, below 0.5 is negative.
- **Blend weights (60% LunarCrush, 40% tweet)**: market data leads, but high-quality tweets still influence.
- **Quadratic position sizing**: squaring the score keeps small signals tiny and lets strong signals grow faster; confidence multiplier then boosts/cuts; capped at 10%.

---

## 🔧 Functions Used

1. `getTokenScore()` - Main orchestrator
2. `fetchMetrics()` - Gets LunarCrush API data
3. `scoreGalaxyScore()` - Converts Galaxy Score (0-100) → (-1 to +1)
4. `scoreSentiment()` - Converts Sentiment (0-1) → (-1 to +1)
5. `scoreSocialVolume()` - Converts Social Change (%) → (-1 to +1)
6. `scoreMomentum()` - Converts Price Change (%) → (-1 to +1)
7. `scoreRank()` - Converts Alt Rank (1-N) → (-1 to +1)
8. `calculateCompositeScore()` - Weighted average of all scores
9. `calculatePositionSize()` - Calculates position size (0-10%)
10. `generateReasoning()` - Creates explanation

---

## 📊 The Flow

```
┌─────────────────────────────────────────────────────────┐
│ INPUT: getTokenScore("BTC", 0.85)                      │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ STEP 1: fetchMetrics("BTC")                            │
│ Returns: {galaxy_score: 78, sentiment: 0.72,           │
│          social_volume_24h_change: 35,                  │
│          price_change_24h: 6.5, alt_rank: 1}          │
│ Why: Grab raw market data to score the token.           │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ STEP 2: Normalize Each Metric                          │
│                                                          │
│ scoreGalaxyScore(78)     →  0.82                        │
│ scoreSentiment(0.72)     →  0.53                        │
│ scoreSocialVolume(35)    →  0.60                        │
│ scoreMomentum(6.5)       →  0.39                        │
│ scoreRank(1)             →  0.99                        │
│ Why: Put every metric on the same -1→+1 scale so they   │
│ can be blended fairly.                                   │
│                                                          │
│ Returns: breakdown = {galaxy: 0.82, sentiment: 0.53,   │
│                       social: 0.60, momentum: 0.39,    │
│                       rank: 0.99}                       │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ STEP 3: calculateCompositeScore(breakdown)            │
│                                                          │
│ Formula: (galaxy×30%) + (sentiment×25%) +              │
│          (social×20%) + (momentum×15%) + (rank×10%)    │
│                                                          │
│ = (0.82×0.30) + (0.53×0.25) + (0.60×0.20) +            │
│   (0.39×0.15) + (0.99×0.10)                             │
│ = 0.66                                                   │
│ Why: Weighted average gives more importance to quality,  │
│ sentiment, and social, with smaller weight to rank.       │
│                                                          │
│ Returns: lunarCrushScore = 0.66                         │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ STEP 4: Combine with Tweet Confidence                  │
│                                                          │
│ tweetScoreNormalized = (0.85 - 0.5) × 2 = 0.70         │
│ Why: Convert tweet confidence (0→1) to -1→+1 to blend    │
│ with LunarCrush score (same scale).                      │
│                                                          │
│ combinedScore = (0.66 × 60%) + (0.70 × 40%)            │
│               = 0.68                                     │
│ Why: 60% market data + 40% tweet quality; market signal  │
│ leads, tweet still influences.                           │
│                                                          │
│ Returns: finalScore = 0.68                              │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ STEP 5: calculatePositionSize(0.68, 0.85)              │
│                                                          │
│ quadraticScore = 0.68² = 0.46                           │
│ Why: Squaring shrinks weak signals (0.3²=0.09) and       │
│ grows strong ones (0.8²=0.64) for conservative→aggressive │
│ sizing.                                                  │
│ baseSize = 0.46 × 10 = 4.6%                             │
│ Why: Map score band (0→1) to position band (0→10%).      │
│ multiplier = 1.2× (confidence 0.85 → 0.7-0.9 range)    │
│ Why: Boost size when tweet confidence is high.           │
│ positionSize = 4.6% × 1.2 = 5.5%                        │
│ Why: Final scaled size; capped at 10% for safety.        │
│                                                          │
│ Returns: positionSize = 5.5%                            │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ OUTPUT                                                   │
│ {                                                       │
│   score: 0.66,              // LunarCrush only         │
│   combinedScore: 0.68,      // LunarCrush + Tweet     │
│   tradeable: true,          // score > 0               │
│   positionSize: 5.5,        // 5.5% of capital        │
│   confidence: 0.68,         // |score|                │
│   breakdown: {...},         // Component scores       │
│   reasoning: "..."          // Explanation            │
│ }                                                       │
└─────────────────────────────────────────────────────────┘
```

---

## 📝 Complete Example: BTC Trade

### Input
- **Token**: BTC
- **Tweet Confidence**: 0.85

### Function Call Sequence

```
getTokenScore("BTC", 0.85)
  ├─→ fetchMetrics("BTC") → {galaxy_score: 78, ...}
  ├─→ scoreGalaxyScore(78) → 0.82
  ├─→ scoreSentiment(0.72) → 0.53
  ├─→ scoreSocialVolume(35) → 0.60
  ├─→ scoreMomentum(6.5) → 0.39
  ├─→ scoreRank(1) → 0.99
  ├─→ calculateCompositeScore({...}) → 0.66
  ├─→ calculatePositionSize(0.68, 0.85) → 5.5
  └─→ generateReasoning({...}) → "Excellent..."
```

### Step-by-Step Calculation

#### 1️⃣ Get Market Data
**Function**: `fetchMetrics("BTC")`
```
Galaxy Score:     78
Sentiment:        0.72
Social Change:    +35%
Price Change:     +6.5%
Alt Rank:         1
```

#### 2️⃣ Normalize Metrics
**Functions**: `scoreGalaxyScore()`, `scoreSentiment()`, `scoreSocialVolume()`, `scoreMomentum()`, `scoreRank()`

```
scoreGalaxyScore(78):
  0.8 + (78-75)/125 = 0.82

scoreSentiment(0.72):
  0.5 + (0.72-0.7)/0.6 = 0.53

scoreSocialVolume(35):
  0.4 + (35-20)/75 = 0.60

scoreMomentum(6.5):
  0.3 + (6.5-5)/16.67 = 0.39

scoreRank(1):
  0.7 + (50-1)/166.67 = 0.99
```

#### 3️⃣ Weighted Average
**Function**: `calculateCompositeScore(breakdown)`
```
Input: {galaxy: 0.82, sentiment: 0.53, social: 0.60, 
        momentum: 0.39, rank: 0.99}

Formula: (galaxy×30%) + (sentiment×25%) + (social×20%) + 
         (momentum×15%) + (rank×10%)

= (0.82×0.30) + (0.53×0.25) + (0.60×0.20) + 
  (0.39×0.15) + (0.99×0.10)
= 0.66

Returns: 0.66
```

#### 4️⃣ Add Tweet Confidence
**Function**: Inside `getTokenScore()`
```
Tweet Confidence: 0.85

Normalize: (0.85 - 0.5) × 2 = 0.70
Why: Tweet confidence is 0→1; we map it to -1→1 so it can be blended with the LunarCrush score (also -1→1). 0.5 becomes neutral (0), above 0.5 becomes positive, below 0.5 becomes negative.

Combine: (0.66 × 60%) + (0.70 × 40%) = 0.68
Why: Weighted blend — 60% market data (LunarCrush), 40% tweet quality — to reflect both market signals and LLM confidence.

Returns: 0.68
```

#### 5️⃣ Calculate Position Size
**Function**: `calculatePositionSize(0.68, 0.85)`
```
Step 1: quadraticScore = 0.68² = 0.46
Why: Squaring shrinks weak signals (e.g., 0.3²=0.09) and grows strong ones (0.8²=0.64), giving conservative sizing for low conviction and faster growth for high conviction.

Step 2: baseSize = 0.46 × 10 = 4.6%
Why: Multiply by 10 to map the 0→1 score band into a 0→10% position band.

Step 3: multiplier = 1.2× (confidence 0.85)
Step 4: positionSize = 4.6% × 1.2 = 5.5%
Step 5: Cap at 10% max (safety ceiling).

Returns: 5.5%
```

### Result
```
✅ Trade: YES
💰 Size: 5.5% of capital
📊 Confidence: 68%
🎯 Direction: LONG (bullish)
```

---

## 🔢 Quick Reference

### Score Range
- **+1.0**: Maximum bullish
- **0.0**: Neutral (no trade)
- **-1.0**: Maximum bearish

### Position Size Formula
```
Position Size = (Final Score²) × 10 × Confidence Multiplier
```

### Confidence Multipliers
| Tweet Confidence | Multiplier |
|-----------------|------------|
| 0.0 - 0.3 | 0.5× |
| 0.3 - 0.5 | 0.7× |
| 0.5 - 0.7 | 1.0× |
| 0.7 - 0.9 | 1.2× |
| 0.9 - 1.0 | 1.5× |

### Component Weights
| Component | Weight |
|-----------|--------|
| Galaxy Score | 30% |
| Sentiment | 25% |
| Social Volume | 20% |
| Momentum | 15% |
| Alt Rank | 10% |

---

## 🎓 Key Points

1. **Score > 0** = Trade (bullish signal)
2. **Position size** = (score²) × 10 × multiplier
3. **Maximum position** = 10% (capped)
4. **Tweet confidence** boosts position size (1.2× to 1.5×)

---

**For detailed formulas**: See `LUNARCRUSH-SCORE-CALCULATION.md`  
**For code**: See `services/signal-generator-worker/src/lib/lunarcrush-score.ts`
