---
title: Supertrend Options Strategy
category: strategy
tags:
  - options-buying
  - momentum
  - scalping
markets:
  - nifty
  - banknifty
timeframes:
  - 5m
  - 15m
difficulty: intermediate
strategy_type: directional
automation_ready: true
---

# Supertrend Options Buying Strategy

## Objective

Capture strong directional momentum in NIFTY or BANKNIFTY using Supertrend confirmation combined with price action and volume.

---

## Market Conditions

**Best for:**
- Trending days
- Volatility expansion
- Post consolidation breakout

**Avoid:**
- Range-bound markets
- Pre-event volatility compression

---

## Indicator Setup

**Supertrend Settings:**
- ATR Period: 10
- Multiplier: 3

**Timeframes:**
- Trend: 15m
- Entry: 5m

---

## Entry Conditions (CALL)

1. Price above Supertrend
2. Break of previous swing high
3. Volume expansion
4. No nearby resistance

**Entry Strike:**
- ATM or ATM+1

---

## Entry Conditions (PUT)

1. Price below Supertrend
2. Break of swing low
3. Volume expansion
4. Weak market breadth

---

## Stop Loss

**Option SL:**
- 30% premium loss
- *or* Underlying invalidation level

---

## Target

- **Target 1**: 40%
- **Target 2**: 80%
- Trail using Supertrend flip

---

## Automation Rules

**Alert Conditions:**
```pinescript
long_signal = close > supertrend and breakout_high
short_signal = close < supertrend and breakdown_low
```

**Webhook JSON:**
```json
{
  "symbol": "NIFTY",
  "signal": "BUY_CALL",
  "strike_selection": "ATM",
  "strategy": "SUPER_TREND"
}
```

---

## Failure Conditions

- Immediate Supertrend flip
- Low volume breakout
- VIX spike against direction
