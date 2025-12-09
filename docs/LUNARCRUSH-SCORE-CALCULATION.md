# LunarCrush Score Calculation - Complete Technical Documentation

## 📊 Overview

The LunarCrush scoring system creates a normalized trading score from **-1 to +1** by combining multiple market metrics from LunarCrush API with EigenAI's tweet confidence score. This score determines:
- **Tradeability**: Whether to execute the trade (score > 0)
- **Position Size**: How much capital to allocate (0-10%, exponentially scaled)
- **Confidence**: How certain we are about the signal

### Score Range Interpretation
- **+1.0**: Maximum bullish signal (strongest buy)
- **+0.5**: Moderate bullish signal
- **0.0**: Neutral (no trade)
- **-0.5**: Moderate bearish signal
- **-1.0**: Maximum bearish signal (strongest sell)

---

## 🔄 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ START: getTokenScore(symbol, tweetConfidence)                  │
│ Input:                                                           │
│   - symbol: "BTC", "ETH", "XRP", etc.                          │
│   - tweetConfidence: 0.85 (from EigenAI LLM)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Fetch LunarCrush Metrics                               │
│ Function: fetchMetrics()                                        │
│                                                                 │
│ Returns:                                                        │
│ {                                                               │
│   galaxy_score: 72,              // 0-100                      │
│   alt_rank: 35,                  // 1-N (lower = better)       │
│   social_volume: 150000,         // Absolute number            │
│   social_volume_24h_change: 45,  // Percentage                 │
│   sentiment: 0.68,               // 0-1 (0=bearish, 1=bullish)│
│   price_change_24h: 8.5,         // Percentage                 │
│   volatility: 62,                // 0-100                      │
│   correlation_rank: 120          // 1-N                        │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Calculate Individual Component Scores                  │
│ Each metric is normalized to -1 to +1 range                    │
│                                                                 │
│ ┌──────────────────────────────────────────────┐               │
│ │ Galaxy Score (72) → scoreGalaxyScore()       │               │
│ │ Result: 0.72                                 │               │
│ └──────────────────────────────────────────────┘               │
│                                                                 │
│ ┌──────────────────────────────────────────────┐               │
│ │ Sentiment (0.68) → scoreSentiment()          │               │
│ │ Result: 0.44                                 │               │
│ └──────────────────────────────────────────────┘               │
│                                                                 │
│ ┌──────────────────────────────────────────────┐               │
│ │ Social Volume (45%) → scoreSocialVolume()    │               │
│ │ Result: 0.73                                 │               │
│ └──────────────────────────────────────────────┘               │
│                                                                 │
│ ┌──────────────────────────────────────────────┐               │
│ │ Momentum (8.5%) → scoreMomentum()            │               │
│ │ Result: 0.51                                 │               │
│ └──────────────────────────────────────────────┘               │
│                                                                 │
│ ┌──────────────────────────────────────────────┐               │
│ │ Alt Rank (35) → scoreRank()                  │               │
│ │ Result: 0.74                                 │               │
│ └──────────────────────────────────────────────┘               │
│                                                                 │
│ Breakdown Object:                                              │
│ {                                                               │
│   galaxy: 0.72,                                                │
│   sentiment: 0.44,                                             │
│   social: 0.73,                                                │
│   momentum: 0.51,                                              │
│   rank: 0.74                                                   │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Calculate Weighted Composite Score (LunarCrush Only)   │
│ Function: calculateCompositeScore()                            │
│                                                                 │
│ Weights:                                                        │
│   Galaxy Score:    30%                                         │
│   Sentiment:       25%                                         │
│   Social Volume:   20%                                         │
│   Momentum:        15%                                         │
│   Alt Rank:        10%                                         │
│                                                                 │
│ Calculation:                                                    │
│ = (0.72 × 0.30) + (0.44 × 0.25) + (0.73 × 0.20)              │
│   + (0.51 × 0.15) + (0.74 × 0.10)                            │
│ = 0.216 + 0.110 + 0.146 + 0.0765 + 0.074                     │
│ = 0.6225                                                        │
│                                                                 │
│ Normalized: 0.62 (LunarCrush Score)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Combine with Tweet Confidence                          │
│                                                                 │
│ Tweet Confidence: 0.85 (from EigenAI)                          │
│                                                                 │
│ Convert to -1 to +1 range:                                     │
│ tweetScoreNormalized = (0.85 - 0.5) × 2                       │
│                      = 0.35 × 2                                │
│                      = 0.70                                    │
│                                                                 │
│ Combine Scores (60% LunarCrush + 40% Tweet):                  │
│ combinedScore = (0.62 × 0.6) + (0.70 × 0.4)                   │
│               = 0.372 + 0.280                                  │
│               = 0.652                                           │
│                                                                 │
│ Final Score: 0.65 (Combined Score)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Calculate Position Size (Exponential Scaling)          │
│ Function: calculatePositionSize()                              │
│                                                                 │
│ Base Calculation (Quadratic):                                  │
│ quadraticScore = score²                                        │
│                = 0.65²                                         │
│                = 0.4225                                        │
│                                                                 │
│ baseSize = quadraticScore × 10                                 │
│          = 0.4225 × 10                                         │
│          = 4.225%                                              │
│                                                                 │
│ Confidence Multiplier:                                         │
│ tweetConfidence = 0.85 → multiplier = 1.2x                    │
│ (0.7-0.9 range gets 1.2x boost)                               │
│                                                                 │
│ Final Position Size:                                           │
│ = 4.225% × 1.2                                                 │
│ = 5.07%                                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: Generate Reasoning & Return Result                     │
│                                                                 │
│ {                                                               │
│   score: 0.62,              // LunarCrush only                │
│   combinedScore: 0.65,      // LunarCrush + Tweet             │
│   tradeable: true,          // score > 0                      │
│   positionSize: 5.07,       // 5.07% of capital               │
│   confidence: 0.65,         // Absolute value of score        │
│   tweetConfidence: 0.85,    // Original tweet confidence      │
│   breakdown: {                                                 │
│     galaxy: 0.72,                                              │
│     sentiment: 0.44,                                           │
│     social: 0.73,                                              │
│     momentum: 0.51,                                            │
│     rank: 0.74                                                 │
│   },                                                            │
│   reasoning: "Good Galaxy Score. Bullish sentiment.           │
│               Strong social growth. High tweet confidence."   │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📐 Detailed Calculation Functions

### 1. Galaxy Score Normalization

**Function**: `scoreGalaxyScore(galaxyScore: number): number`

**Input Range**: 0-100 (LunarCrush Galaxy Score)  
**Output Range**: -1.0 to +1.0

#### Scoring Tiers:
```
Galaxy Score Range  →  Normalized Score  →  Rating
─────────────────────────────────────────────────────
75-100             →  +0.8 to +1.0      →  Excellent
60-74              →  +0.4 to +0.8      →  Good
50-59              →  +0.0 to +0.4      →  Average
40-49              →  -0.4 to +0.0      →  Poor
0-39               →  -1.0 to -0.4      →  Very Poor
```

#### Mathematical Formulas:

```typescript
if (galaxyScore >= 75):
  score = 0.8 + (galaxyScore - 75) / 125
  // Range: 0.8 to 1.0

if (galaxyScore >= 60):
  score = 0.4 + (galaxyScore - 60) / 37.5
  // Range: 0.4 to 0.8

if (galaxyScore >= 50):
  score = 0.0 + (galaxyScore - 50) / 25
  // Range: 0.0 to 0.4

if (galaxyScore >= 40):
  score = -0.4 + (galaxyScore - 40) / 25
  // Range: -0.4 to 0.0

if (galaxyScore < 40):
  score = -1.0 + (galaxyScore) / 40
  // Range: -1.0 to -0.4
```

#### Examples:

**Example 1: Excellent Galaxy Score**
```
Input: galaxyScore = 85
Calculation: 0.8 + (85 - 75) / 125
           = 0.8 + 10 / 125
           = 0.8 + 0.08
           = 0.88
Output: +0.88 (Excellent rating)
```

**Example 2: Average Galaxy Score**
```
Input: galaxyScore = 55
Calculation: 0.0 + (55 - 50) / 25
           = 0.0 + 5 / 25
           = 0.0 + 0.20
           = 0.20
Output: +0.20 (Average rating)
```

**Example 3: Poor Galaxy Score**
```
Input: galaxyScore = 25
Calculation: -1.0 + (25) / 40
           = -1.0 + 0.625
           = -0.375
Output: -0.38 (Very poor rating)
```

---

### 2. Sentiment Normalization

**Function**: `scoreSentiment(sentiment: number): number`

**Input Range**: 0-1 (0 = bearish, 1 = bullish)  
**Output Range**: -1.0 to +1.0

#### Scoring Tiers:
```
Sentiment Range  →  Normalized Score  →  Rating
────────────────────────────────────────────────────
0.7-1.0         →  +0.5 to +1.0      →  Very Bullish
0.6-0.69        →  +0.2 to +0.5      →  Bullish
0.4-0.59        →  -0.2 to +0.2      →  Neutral
0.3-0.39        →  -0.5 to -0.2      →  Bearish
0.0-0.29        →  -1.0 to -0.5      →  Very Bearish
```

#### Mathematical Formulas:

```typescript
if (sentiment >= 0.7):
  score = 0.5 + (sentiment - 0.7) / 0.6
  // Range: 0.5 to 1.0

if (sentiment >= 0.6):
  score = 0.2 + (sentiment - 0.6) / 0.333
  // Range: 0.2 to 0.5

if (sentiment >= 0.4):
  score = -0.2 + (sentiment - 0.4) / 0.5
  // Range: -0.2 to 0.2

if (sentiment >= 0.3):
  score = -0.5 + (sentiment - 0.3) / 0.333
  // Range: -0.5 to -0.2

if (sentiment < 0.3):
  score = -1.0 + sentiment / 0.3
  // Range: -1.0 to -0.5
```

#### Examples:

**Example 1: Very Bullish Sentiment**
```
Input: sentiment = 0.85
Calculation: 0.5 + (0.85 - 0.7) / 0.6
           = 0.5 + 0.15 / 0.6
           = 0.5 + 0.25
           = 0.75
Output: +0.75 (Very bullish)
```

**Example 2: Neutral Sentiment**
```
Input: sentiment = 0.50
Calculation: -0.2 + (0.50 - 0.4) / 0.5
           = -0.2 + 0.10 / 0.5
           = -0.2 + 0.20
           = 0.00
Output: 0.00 (Neutral)
```

**Example 3: Bearish Sentiment**
```
Input: sentiment = 0.20
Calculation: -1.0 + 0.20 / 0.3
           = -1.0 + 0.667
           = -0.333
Output: -0.33 (Very bearish)
```

---

### 3. Social Volume Change Normalization

**Function**: `scoreSocialVolume(change: number): number`

**Input Range**: -100% to +300% (percentage change in 24h)  
**Output Range**: -1.0 to +1.0

#### Scoring Tiers:
```
Volume Change   →  Normalized Score  →  Rating
─────────────────────────────────────────────────
>50%           →  +0.8 to +1.0      →  Explosive
20-50%         →  +0.4 to +0.8      →  Strong
0-20%          →  +0.0 to +0.4      →  Positive
-20-0%         →  -0.4 to +0.0      →  Weak
<-20%          →  -1.0 to -0.4      →  Dead
```

#### Mathematical Formulas:

```typescript
if (change > 50):
  score = 0.8 + min(0.2, (change - 50) / 250)
  // Range: 0.8 to 1.0 (caps at 100% change)

if (change > 20):
  score = 0.4 + (change - 20) / 75
  // Range: 0.4 to 0.8

if (change > 0):
  score = 0.0 + change / 50
  // Range: 0.0 to 0.4

if (change > -20):
  score = -0.4 + (change + 20) / 50
  // Range: -0.4 to 0.0

if (change <= -20):
  score = max(-1.0, -1.0 + (change + 100) / 80)
  // Range: -1.0 to -0.4
```

#### Examples:

**Example 1: Explosive Growth**
```
Input: change = 75%
Calculation: 0.8 + min(0.2, (75 - 50) / 250)
           = 0.8 + min(0.2, 25 / 250)
           = 0.8 + min(0.2, 0.10)
           = 0.8 + 0.10
           = 0.90
Output: +0.90 (Explosive social growth)
```

**Example 2: Moderate Growth**
```
Input: change = 35%
Calculation: 0.4 + (35 - 20) / 75
           = 0.4 + 15 / 75
           = 0.4 + 0.20
           = 0.60
Output: +0.60 (Strong growth)
```

**Example 3: Declining Interest**
```
Input: change = -30%
Calculation: max(-1.0, -1.0 + (-30 + 100) / 80)
           = max(-1.0, -1.0 + 70 / 80)
           = max(-1.0, -1.0 + 0.875)
           = max(-1.0, -0.125)
           = -0.125
Output: -0.13 (Declining interest)
```

---

### 4. Price Momentum Normalization

**Function**: `scoreMomentum(priceChange: number): number`

**Input Range**: -30% to +30% (24h price change)  
**Output Range**: -1.0 to +1.0

#### Scoring Tiers:
```
Price Change    →  Normalized Score  →  Rating
─────────────────────────────────────────────────
>10%           →  +0.6 to +1.0      →  Strong Up
5-10%          →  +0.3 to +0.6      →  Up
-5 to 5%       →  -0.3 to +0.3      →  Flat
-10 to -5%     →  -0.6 to -0.3      →  Down
<-10%          →  -1.0 to -0.6      →  Strong Down
```

#### Mathematical Formulas:

```typescript
if (priceChange > 10):
  score = 0.6 + min(0.4, (priceChange - 10) / 25)
  // Range: 0.6 to 1.0

if (priceChange > 5):
  score = 0.3 + (priceChange - 5) / 16.67
  // Range: 0.3 to 0.6

if (priceChange > -5):
  score = priceChange / 16.67
  // Range: -0.3 to 0.3

if (priceChange > -10):
  score = -0.6 + (priceChange + 10) / 16.67
  // Range: -0.6 to -0.3

if (priceChange <= -10):
  score = max(-1.0, -1.0 + (priceChange + 30) / 20)
  // Range: -1.0 to -0.6
```

#### Examples:

**Example 1: Strong Upward Momentum**
```
Input: priceChange = 18%
Calculation: 0.6 + min(0.4, (18 - 10) / 25)
           = 0.6 + min(0.4, 8 / 25)
           = 0.6 + min(0.4, 0.32)
           = 0.6 + 0.32
           = 0.92
Output: +0.92 (Strong upward momentum)
```

**Example 2: Moderate Upward Momentum**
```
Input: priceChange = 7%
Calculation: 0.3 + (7 - 5) / 16.67
           = 0.3 + 2 / 16.67
           = 0.3 + 0.12
           = 0.42
Output: +0.42 (Moderate upward momentum)
```

**Example 3: Negative Momentum**
```
Input: priceChange = -15%
Calculation: max(-1.0, -1.0 + (-15 + 30) / 20)
           = max(-1.0, -1.0 + 15 / 20)
           = max(-1.0, -1.0 + 0.75)
           = max(-1.0, -0.25)
           = -0.25
Output: -0.25 (Negative momentum, but not extreme)
```

---

### 5. Alt Rank Normalization

**Function**: `scoreRank(altRank: number): number`

**Input Range**: 1-2000+ (rank position, lower is better)  
**Output Range**: -1.0 to +1.0

#### Scoring Tiers:
```
Alt Rank      →  Normalized Score  →  Rating
──────────────────────────────────────────────
1-50         →  +0.7 to +1.0      →  Top Tier
51-200       →  +0.3 to +0.7      →  Good
201-500      →  -0.2 to +0.3      →  Average
501-1000     →  -0.6 to -0.2      →  Poor
>1000        →  -1.0 to -0.6      →  Very Poor
```

#### Mathematical Formulas:

```typescript
if (altRank <= 50):
  score = 0.7 + (50 - altRank) / 166.67
  // Range: 0.7 to 1.0
  // Rank 1 → 1.0, Rank 50 → 0.7

if (altRank <= 200):
  score = 0.3 + (200 - altRank) / 375
  // Range: 0.3 to 0.7

if (altRank <= 500):
  score = -0.2 + (500 - altRank) / 600
  // Range: -0.2 to 0.3

if (altRank <= 1000):
  score = -0.6 + (1000 - altRank) / 1250
  // Range: -0.6 to -0.2

if (altRank > 1000):
  score = max(-1.0, -1.0 + (2000 - altRank) / 1000)
  // Range: -1.0 to -0.6
```

#### Examples:

**Example 1: Top Tier Token (Rank 15)**
```
Input: altRank = 15
Calculation: 0.7 + (50 - 15) / 166.67
           = 0.7 + 35 / 166.67
           = 0.7 + 0.21
           = 0.91
Output: +0.91 (Top tier project)
```

**Example 2: Good Token (Rank 120)**
```
Input: altRank = 120
Calculation: 0.3 + (200 - 120) / 375
           = 0.3 + 80 / 375
           = 0.3 + 0.213
           = 0.513
Output: +0.51 (Good project)
```

**Example 3: Poor Ranking (Rank 750)**
```
Input: altRank = 750
Calculation: -0.6 + (1000 - 750) / 1250
           = -0.6 + 250 / 1250
           = -0.6 + 0.20
           = -0.40
Output: -0.40 (Poor ranking)
```

---

## ⚖️ Composite Score Calculation

### Weighted Combination

**Function**: `calculateCompositeScore(breakdown): number`

The composite score combines all individual metrics with specific weights:

```typescript
compositeScore = 
  (galaxy × 0.30) +      // 30% weight - Overall project quality
  (sentiment × 0.25) +   // 25% weight - Market sentiment
  (social × 0.20) +      // 20% weight - Social engagement
  (momentum × 0.15) +    // 15% weight - Price action
  (rank × 0.10)          // 10% weight - Market position
```

### Weighting Rationale

| Component | Weight | Rationale |
|-----------|--------|-----------|
| **Galaxy Score** | 30% | Comprehensive quality metric from LunarCrush combining multiple factors |
| **Sentiment** | 25% | Direct indicator of market psychology and trader mood |
| **Social Volume** | 20% | Community engagement and viral potential |
| **Momentum** | 15% | Recent price action and trend direction |
| **Alt Rank** | 10% | Market cap position (less weight as it's more stable) |

### Complete Example:

```
Given Breakdown:
  galaxy = 0.72
  sentiment = 0.44
  social = 0.73
  momentum = 0.51
  rank = 0.74

Calculation:
= (0.72 × 0.30) + (0.44 × 0.25) + (0.73 × 0.20) + (0.51 × 0.15) + (0.74 × 0.10)
= 0.216       + 0.110        + 0.146        + 0.0765       + 0.074
= 0.6225

Rounded: 0.62
```

---

## 🎯 Tweet Confidence Integration

### Converting Tweet Confidence to Score Range

The EigenAI LLM provides a confidence score (0-1) for each tweet. We convert this to the -1 to +1 range:

```typescript
tweetScoreNormalized = (tweetConfidence - 0.5) × 2
```

**Examples:**

| Tweet Confidence | Calculation | Normalized Score |
|-----------------|-------------|------------------|
| 0.0 (no confidence) | (0.0 - 0.5) × 2 = -1.0 | -1.0 (maximum negative) |
| 0.3 (low) | (0.3 - 0.5) × 2 = -0.4 | -0.4 (bearish) |
| 0.5 (neutral) | (0.5 - 0.5) × 2 = 0.0 | 0.0 (neutral) |
| 0.7 (good) | (0.7 - 0.5) × 2 = +0.4 | +0.4 (bullish) |
| 0.85 (high) | (0.85 - 0.5) × 2 = +0.7 | +0.7 (strong bullish) |
| 1.0 (maximum) | (1.0 - 0.5) × 2 = +1.0 | +1.0 (maximum bullish) |

### Combined Score Formula

```typescript
combinedScore = (lunarCrushScore × 0.6) + (tweetScoreNormalized × 0.4)
```

**60% LunarCrush + 40% Tweet Confidence**

This weighting gives more importance to market data (LunarCrush) while still incorporating the tweet's quality signal.

### Example:

```
LunarCrush Score: 0.62
Tweet Confidence: 0.85

Step 1: Normalize tweet confidence
tweetScoreNormalized = (0.85 - 0.5) × 2 = 0.70

Step 2: Combine scores
combinedScore = (0.62 × 0.6) + (0.70 × 0.4)
              = 0.372 + 0.280
              = 0.652

Final Combined Score: 0.65
```

---

## 📈 Position Size Calculation (Exponential Scaling)

### Function: `calculatePositionSize(score, tweetConfidence): number`

Position sizing uses **quadratic (exponential) scaling** to be conservative with weak signals and aggressive with strong ones.

### Formula:

```typescript
baseSize = (score²) × 10

positionSize = baseSize × confidenceMultiplier
```

### Confidence Multiplier Tiers:

| Tweet Confidence | Multiplier | Effect |
|-----------------|------------|---------|
| 0.0 - 0.3 | 0.5× | Reduce weak signals by 50% |
| 0.3 - 0.5 | 0.7× | Slightly reduce uncertain signals |
| 0.5 - 0.7 | 1.0× | Neutral (no change) |
| 0.7 - 0.9 | 1.2× | Boost confident signals by 20% |
| 0.9 - 1.0 | 1.5× | Aggressively boost very confident signals by 50% |

### Why Quadratic Scaling?

Linear scaling would give:
- Score 0.5 → 5% position
- Score 1.0 → 10% position

Quadratic scaling gives:
- Score 0.5 → 2.5% position
- Score 1.0 → 10% position

This creates exponential growth, allocating more capital to high-confidence signals.

### Complete Examples:

#### Example 1: Weak Signal (Score: 0.3, Confidence: 0.4)

```
Step 1: Quadratic scaling
quadraticScore = 0.3² = 0.09

Step 2: Base size
baseSize = 0.09 × 10 = 0.9%

Step 3: Confidence multiplier (0.3-0.5 range)
multiplier = 0.7×

Step 4: Final position size
positionSize = 0.9% × 0.7 = 0.63%

Result: 0.63% of capital (very conservative)
```

#### Example 2: Moderate Signal (Score: 0.5, Confidence: 0.7)

```
Step 1: Quadratic scaling
quadraticScore = 0.5² = 0.25

Step 2: Base size
baseSize = 0.25 × 10 = 2.5%

Step 3: Confidence multiplier (0.5-0.7 range)
multiplier = 1.0×

Step 4: Final position size
positionSize = 2.5% × 1.0 = 2.5%

Result: 2.5% of capital
```

#### Example 3: Strong Signal (Score: 0.8, Confidence: 0.85)

```
Step 1: Quadratic scaling
quadraticScore = 0.8² = 0.64

Step 2: Base size
baseSize = 0.64 × 10 = 6.4%

Step 3: Confidence multiplier (0.7-0.9 range)
multiplier = 1.2×

Step 4: Final position size
positionSize = 6.4% × 1.2 = 7.68%

Result: 7.68% of capital (aggressive)
```

#### Example 4: Maximum Signal (Score: 1.0, Confidence: 0.95)

```
Step 1: Quadratic scaling
quadraticScore = 1.0² = 1.0

Step 2: Base size
baseSize = 1.0 × 10 = 10%

Step 3: Confidence multiplier (0.9-1.0 range)
multiplier = 1.5×

Step 4: Final position size
positionSize = 10% × 1.5 = 15%
BUT CAPPED at 10%

Result: 10% of capital (maximum allowed)
```

---

## 📊 Position Size Scaling Chart

```
Score  │ Base (score²×10) │ Confidence 0.4 │ Confidence 0.7 │ Confidence 0.95
───────┼──────────────────┼────────────────┼────────────────┼─────────────────
0.1    │ 0.10%           │ 0.07%          │ 0.10%          │ 0.15%
0.2    │ 0.40%           │ 0.28%          │ 0.40%          │ 0.60%
0.3    │ 0.90%           │ 0.63%          │ 0.90%          │ 1.35%
0.4    │ 1.60%           │ 1.12%          │ 1.60%          │ 2.40%
0.5    │ 2.50%           │ 1.75%          │ 2.50%          │ 3.75%
0.6    │ 3.60%           │ 2.52%          │ 3.60%          │ 5.40%
0.7    │ 4.90%           │ 3.43%          │ 4.90%          │ 7.35%
0.8    │ 6.40%           │ 4.48%          │ 7.68%*         │ 9.60%
0.9    │ 8.10%           │ 5.67%          │ 9.72%*         │ 10.00%** (capped)
1.0    │ 10.00%          │ 7.00%          │ 10.00%** (capped) │ 10.00%** (capped)

* With 1.2× multiplier (confidence 0.7-0.9)
** Capped at maximum 10%
```

---

## 🔍 Complete End-to-End Example

### Scenario: BTC Trade Signal

**Inputs:**
- Token: BTC
- Tweet: "Bitcoin breaking resistance at $45k, expecting continuation to $50k"
- Tweet Confidence (from EigenAI): 0.85

**Step 1: Fetch LunarCrush Metrics**
```json
{
  "galaxy_score": 78,
  "alt_rank": 1,
  "social_volume": 250000,
  "social_volume_24h_change": 35,
  "sentiment": 0.72,
  "price_change_24h": 6.5,
  "volatility": 48,
  "correlation_rank": 1
}
```

**Step 2: Calculate Individual Scores**

```
Galaxy Score (78):
= 0.8 + (78 - 75) / 125
= 0.8 + 0.024
= 0.824

Sentiment (0.72):
= 0.5 + (0.72 - 0.7) / 0.6
= 0.5 + 0.033
= 0.533

Social Volume (35%):
= 0.4 + (35 - 20) / 75
= 0.4 + 0.20
= 0.60

Momentum (6.5%):
= 0.3 + (6.5 - 5) / 16.67
= 0.3 + 0.09
= 0.39

Alt Rank (1):
= 0.7 + (50 - 1) / 166.67
= 0.7 + 0.294
= 0.994
```

**Breakdown:**
```json
{
  "galaxy": 0.824,
  "sentiment": 0.533,
  "social": 0.60,
  "momentum": 0.39,
  "rank": 0.994
}
```

**Step 3: Calculate Composite Score**

```
LunarCrush Score = 
  (0.824 × 0.30) + (0.533 × 0.25) + (0.60 × 0.20) + (0.39 × 0.15) + (0.994 × 0.10)
= 0.2472 + 0.1333 + 0.120 + 0.0585 + 0.0994
= 0.6584

Normalized: 0.66
```

**Step 4: Combine with Tweet Confidence**

```
Tweet Confidence: 0.85
Tweet Normalized: (0.85 - 0.5) × 2 = 0.70

Combined Score = (0.66 × 0.6) + (0.70 × 0.4)
               = 0.396 + 0.280
               = 0.676

Final Score: 0.68
```

**Step 5: Calculate Position Size**

```
Quadratic: 0.68² = 0.4624
Base Size: 0.4624 × 10 = 4.624%

Confidence Multiplier (0.85 → 0.7-0.9 range): 1.2×

Position Size = 4.624% × 1.2 = 5.55%
```

**Step 6: Generate Reasoning**

```
"Excellent Galaxy Score. Very bullish sentiment. Strong social growth. 
High tweet confidence."
```

**Final Result:**
```json
{
  "score": 0.66,
  "combinedScore": 0.68,
  "tradeable": true,
  "positionSize": 5.55,
  "confidence": 0.68,
  "tweetConfidence": 0.85,
  "breakdown": {
    "galaxy": 0.824,
    "sentiment": 0.533,
    "social": 0.60,
    "momentum": 0.39,
    "rank": 0.994
  },
  "reasoning": "Excellent Galaxy Score. Very bullish sentiment. Strong social growth. High tweet confidence."
}
```

**Trade Decision:**
- ✅ **Execute Trade** (score > 0)
- 💰 **Allocate 5.55%** of trading capital
- 📊 **Confidence: 68%**
- 🎯 **Strong bullish signal with high-quality tweet**

---

## 📋 Summary Table

| Component | Input Range | Output Range | Weight | Purpose |
|-----------|------------|--------------|--------|---------|
| Galaxy Score | 0-100 | -1 to +1 | 30% | Overall project quality |
| Sentiment | 0-1 | -1 to +1 | 25% | Market psychology |
| Social Volume | -100% to +300% | -1 to +1 | 20% | Engagement & virality |
| Momentum | -30% to +30% | -1 to +1 | 15% | Price trend |
| Alt Rank | 1-2000+ | -1 to +1 | 10% | Market position |
| **LunarCrush** | - | -1 to +1 | 60% | Market data composite |
| **Tweet Confidence** | 0-1 | -1 to +1 | 40% | Signal quality |
| **Final Combined** | - | -1 to +1 | 100% | Trade decision |

---

## 🎓 Key Insights

1. **Non-Linear Scaling**: Quadratic position sizing ensures conservative allocation for weak signals and aggressive allocation for strong ones.

2. **Multi-Factor Analysis**: Combines 5 different market metrics to reduce single-point-of-failure risk.

3. **Tweet Quality Integration**: EigenAI's confidence score acts as a signal filter and position size multiplier.

4. **Risk Management**: Maximum 10% position size cap prevents over-allocation even on perfect signals.

5. **Weighted Importance**: Galaxy Score (30%) and Sentiment (25%) carry the most weight as they're comprehensive indicators.

6. **Confidence Multipliers**: Tweet confidence can boost or reduce position size by up to 50%, adding another layer of risk control.

---

This documentation provides the complete mathematical foundation for the LunarCrush scoring system! 🚀
