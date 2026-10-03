/* continues babypips-a.js */
function crossedUp(fast, slow, lookback) {
  const i = fast.length - 1;
  if (fast[i] == null || slow[i] == null || fast[i] <= slow[i]) return false;
  for (let j = 1; j <= lookback; j++) {
    const a = i - j;
    if (a < 0) break;
    if (fast[a] != null && slow[a] != null && fast[a] <= slow[a]) return true;
  }
  return false;
}

function crossedDown(fast, slow, lookback) {
  const i = fast.length - 1;
  if (fast[i] == null || slow[i] == null || fast[i] >= slow[i]) return false;
  for (let j = 1; j <= lookback; j++) {
    const a = i - j;
    if (a < 0) break;
    if (fast[a] != null && slow[a] != null && fast[a] >= slow[a]) return true;
  }
  return false;
}

/**
 * BabyPips Cowabunga end-of-course checklist encoded as three boxes:
 * Trend, Momentum, Support/Resistance. All three bullish => buy;
 * all three bearish => sell; otherwise hold.
 * Source: https://www.babypips.com/trading/cowabunga-system
 */
function babyBoxes(bars, rules) {
  const b = rules.babypips;
  if (!bars || bars.length < 80) {
    return { signal: "hold", trend: null, momentum: null, structure: null, detail: {} };
  }
  const closes = bars.map((x) => x.close);
  const highs = bars.map((x) => x.high);
  const lows = bars.map((x) => x.low);
  const last = closes[closes.length - 1];

  // Higher-timeframe trend (Cowabunga 4H): weekly bars from daily.
  const higher = resampleOHLC(bars, b.higherTfBars || 5);
  const hCloses = higher.map((x) => x.close);
  const hFast = emaSeries(hCloses, b.emaFast);
  const hSlow = emaSeries(hCloses, b.emaSlow);
  const hi = hCloses.length - 1;
  const higherUp = hFast[hi] != null && hSlow[hi] != null && hFast[hi] > hSlow[hi];
  const higherDown = hFast[hi] != null && hSlow[hi] != null && hFast[hi] < hSlow[hi];

  // Entry timeframe (Cowabunga 15m -> daily for stocks): EMA cross.
  const fast = emaSeries(closes, b.emaFast);
  const slow = emaSeries(closes, b.emaSlow);
  const longCross = crossedUp(fast, slow, b.crossLookback || 5);
  const shortCross = crossedDown(fast, slow, b.crossLookback || 5);
  const trendBull = higherUp && (longCross || (fast[fast.length - 1] > slow[slow.length - 1]));
  const trendBear = higherDown && (shortCross || (fast[fast.length - 1] < slow[slow.length - 1]));
  // Prefer requiring an actual cross for a fresh buy/sell; still allow aligned MAs for box score.
  const trendBuy = higherUp && longCross;
  const trendSell = higherDown && shortCross;
  const trend = trendBuy ? "bull" : trendSell ? "bear" : (trendBull && !trendBear ? "bull-soft" : trendBear && !trendBull ? "bear-soft" : "flat");

  // Momentum: RSI(9), Stochastic(10,3,3), MACD hist(12,26,9) — Cowabunga long/short rules.
  const rsiArr = rsiSeries(closes, b.rsiPeriod);
  const r = rsiArr[rsiArr.length - 1];
  const st = stochasticSeries(highs, lows, closes, b.stochK, b.stochSmooth, b.stochD);
  const kNow = st.k[st.k.length - 1];
  const kPrev = st.k[st.k.length - 2];
  const stochUp = kNow != null && kPrev != null && kNow > kPrev && kNow < b.stochOb;
  const stochDown = kNow != null && kPrev != null && kNow < kPrev && kNow > b.stochOs;
  const hist = macdHistSeries(closes, b.macdFast, b.macdSlow, b.macdSignal);
  const h0 = hist[hist.length - 1];
  const h1 = hist[hist.length - 2];
  // Long: hist goes neg->pos OR is negative and rising. Short: opposite.
  const macdLong = h0 != null && h1 != null && ((h1 < 0 && h0 >= 0) || (h0 < 0 && h0 > h1));
  const macdShort = h0 != null && h1 != null && ((h1 > 0 && h0 <= 0) || (h0 > 0 && h0 < h1));
  const momBuy = r != null && r > b.rsiMid && stochUp && macdLong;
  const momSell = r != null && r < b.rsiMid && stochDown && macdShort;
  const momentum = momBuy ? "bull" : momSell ? "bear" : "flat";

  // Support / resistance: Cowabunga swing stop; stay out if stop is too wide;
  // target may be equal-risk (Cowabunga) or the opposite swing when it offers more room.
  const swingLow = recentSwing(lows, highs, b.swingBars, "low");
  const swingHigh = recentSwing(lows, highs, b.swingBars, "high");
  const riskLong = swingLow != null ? last - swingLow : 0;
  const riskShort = swingHigh != null ? swingHigh - last : 0;
  const stopOkLong = riskLong > 0 && (riskLong / last) * 100 <= (b.maxStopPct || 8);
  const stopOkShort = riskShort > 0 && (riskShort / last) * 100 <= (b.maxStopPct || 8);
  const targetLong = stopOkLong ? Math.max(swingHigh != null && swingHigh > last ? swingHigh : last, last + riskLong * b.rrMin) : null;
  const targetShort = stopOkShort ? Math.min(swingLow != null && swingLow < last ? swingLow : last, last - riskShort * b.rrMin) : null;
  const rrLong = stopOkLong && targetLong != null ? (targetLong - last) / riskLong : 0;
  const rrShort = stopOkShort && targetShort != null ? (last - targetShort) / riskShort : 0;
  const structBuy = stopOkLong && rrLong >= b.rrMin;
  const structSell = stopOkShort && rrShort >= b.rrMin;
  const structure = structBuy && !structSell ? "bull" : structSell && !structBuy ? "bear" : structBuy && structSell ? "both" : "flat";

  let signal = "hold";
  if (trendBuy && momBuy && structBuy) signal = "buy";
  else if (trendSell && momSell && structSell) signal = "sell";

  return {
    signal,
    trend,
    momentum,
    structure,
    detail: {
      last, r, kNow, h0, higherUp, higherDown, longCross, shortCross,
      swingLow, swingHigh, rrLong, rrShort,
      emaFast: fast[fast.length - 1], emaSlow: slow[slow.length - 1]
    }
  };
}

function babySignal(bars, rules) {
  return babyBoxes(bars, rules).signal;
}

function rsi(closes, n) {
  const arr = rsiSeries(closes, n);
  return arr[arr.length - 1];
}
