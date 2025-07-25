const logger = require('../utils/logger');
const { MACD, RSI, StochasticRSI, BollingerBands, SMA, EMA } = require('technicalindicators');

class EnhancedTradingStrategy {
  constructor(marketDataManager, riskManager) {
    this.marketData = marketDataManager;
    this.riskManager = riskManager;
    this.lastSignal = null;
    this.signalHistory = [];
    this.priceHistory = [];
    this.rsiHistory = [];
    this.macdHistory = [];
    
    // Strategy parameters
    this.config = {
      macd: {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9
      },
      rsi: {
        period: 14,
        oversold: 30,
        overbought: 70
      },
      stochRsi: {
        kPeriod: 3,
        dPeriod: 3,
        rsiPeriod: 14,
        stochPeriod: 14
      },
      bollinger: {
        period: 20,
        stdDev: 2
      },
      ema: {
        fast: 9,
        slow: 21
      },
      divergence: {
        lookback: 10,
        minStrength: 0.6
      }
    };
  }

  analyze() {
    try {
      const currentPrice = this.marketData.getLatestPrice();
      const priceData = this.marketData.getPriceHistory(50);
      
      if (!currentPrice || !priceData || priceData.length < 30) {
        return this.createSignal('HOLD', 0, 'Insufficient price data');
      }

      // Update price history
      this.updatePriceHistory(priceData);
      
      // Calculate all indicators
      const indicators = this.calculateIndicators(priceData);
      
      if (!this.hasRequiredIndicators(indicators)) {
        return this.createSignal('HOLD', 0, 'Indicators not ready');
      }

      // Analyze signals
      const signals = this.analyzeAllSignals(indicators, currentPrice);
      
      // Combine signals with weights
      const finalSignal = this.combineSignals(signals);
      
      // Apply risk filters
      const filteredSignal = this.applyAdvancedRiskFilters(finalSignal, indicators);

      this.logAnalysis(filteredSignal, signals, indicators);
      
      this.lastSignal = filteredSignal;
      this.signalHistory.push({
        ...filteredSignal,
        timestamp: new Date().toISOString(),
        indicators: this.simplifyIndicators(indicators)
      });

      return filteredSignal;
    } catch (error) {
      logger.error('Enhanced strategy analysis error', error);
      return this.createSignal('HOLD', 0, 'Analysis error');
    }
  }

  updatePriceHistory(priceData) {
    this.priceHistory = priceData.map(p => p.price || p).slice(-50);
  }

  calculateIndicators(priceData) {
    const prices = priceData.map(p => p.price || p);
    const highs = priceData.map(p => p.high || p.price || p);
    const lows = priceData.map(p => p.low || p.price || p);
    const closes = prices;

    try {
      // MACD
      const macdData = MACD.calculate({
        values: closes,
        fastPeriod: this.config.macd.fastPeriod,
        slowPeriod: this.config.macd.slowPeriod,
        signalPeriod: this.config.macd.signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });

      // RSI
      const rsiData = RSI.calculate({
        values: closes,
        period: this.config.rsi.period
      });

      // Stochastic RSI
      const stochRsiData = StochasticRSI.calculate({
        values: closes,
        kPeriod: this.config.stochRsi.kPeriod,
        dPeriod: this.config.stochRsi.dPeriod,
        rsiPeriod: this.config.stochRsi.rsiPeriod,
        stochasticPeriod: this.config.stochRsi.stochPeriod
      });

      // Bollinger Bands
      const bbData = BollingerBands.calculate({
        values: closes,
        period: this.config.bollinger.period,
        stdDev: this.config.bollinger.stdDev
      });

      // EMAs
      const emaFast = EMA.calculate({
        values: closes,
        period: this.config.ema.fast
      });

      const emaSlow = EMA.calculate({
        values: closes,
        period: this.config.ema.slow
      });

      return {
        macd: macdData.slice(-10),
        rsi: rsiData.slice(-20),
        stochRsi: stochRsiData.slice(-10),
        bollinger: bbData.slice(-10),
        emaFast: emaFast.slice(-10),
        emaSlow: emaSlow.slice(-10),
        prices: closes.slice(-20),
        currentPrice: closes[closes.length - 1]
      };

    } catch (error) {
      logger.error('Indicator calculation error', error);
      return null;
    }
  }

  hasRequiredIndicators(indicators) {
    return indicators && 
           indicators.macd && indicators.macd.length > 3 &&
           indicators.rsi && indicators.rsi.length > 5 &&
           indicators.emaFast && indicators.emaFast.length > 2 &&
           indicators.emaSlow && indicators.emaSlow.length > 2;
  }

  analyzeAllSignals(indicators, currentPrice) {
    const signals = [];

    // MACD Analysis
    const macdSignal = this.analyzeMACDSignal(indicators.macd);
    if (macdSignal.signal !== 'NEUTRAL') signals.push(macdSignal);

    // MACD Divergence
    const macdDivergence = this.analyzeMACDDivergence(indicators.prices, indicators.macd);
    if (macdDivergence.signal !== 'NEUTRAL') signals.push(macdDivergence);

    // RSI Analysis
    const rsiSignal = this.analyzeRSISignal(indicators.rsi);
    if (rsiSignal.signal !== 'NEUTRAL') signals.push(rsiSignal);

    // RSI Divergence
    const rsiDivergence = this.analyzeRSIDivergence(indicators.prices, indicators.rsi);
    if (rsiDivergence.signal !== 'NEUTRAL') signals.push(rsiDivergence);

    // Stochastic RSI
    const stochRsiSignal = this.analyzeStochRSI(indicators.stochRsi);
    if (stochRsiSignal.signal !== 'NEUTRAL') signals.push(stochRsiSignal);

    // EMA Crossover
    const emaCrossover = this.analyzeEMACrossover(indicators.emaFast, indicators.emaSlow);
    if (emaCrossover.signal !== 'NEUTRAL') signals.push(emaCrossover);

    // Bollinger Bands
    const bbSignal = this.analyzeBollingerBands(currentPrice, indicators.bollinger);
    if (bbSignal.signal !== 'NEUTRAL') signals.push(bbSignal);

    // Multi-timeframe confluence
    const confluenceSignal = this.analyzeConfluence(signals);
    if (confluenceSignal.signal !== 'NEUTRAL') signals.push(confluenceSignal);

    return signals;
  }

  analyzeMACDSignal(macdData) {
    if (macdData.length < 3) {
      return { signal: 'NEUTRAL', weight: 0, reason: 'MACD insufficient data' };
    }

    const current = macdData[macdData.length - 1];
    const previous = macdData[macdData.length - 2];

    // MACD Line crossing Signal Line
    if (previous.MACD <= previous.signal && current.MACD > current.signal) {
      return {
        signal: 'BUY',
        weight: 0.3,
        reason: 'MACD bullish crossover',
        strength: Math.min(Math.abs(current.MACD - current.signal) / 100, 1)
      };
    }

    if (previous.MACD >= previous.signal && current.MACD < current.signal) {
      return {
        signal: 'SELL',
        weight: 0.3,
        reason: 'MACD bearish crossover',
        strength: Math.min(Math.abs(current.MACD - current.signal) / 100, 1)
      };
    }

    // MACD crossing zero line
    if (previous.MACD <= 0 && current.MACD > 0) {
      return {
        signal: 'BUY',
        weight: 0.2,
        reason: 'MACD bullish zero cross',
        strength: Math.min(current.MACD / 50, 1)
      };
    }

    if (previous.MACD >= 0 && current.MACD < 0) {
      return {
        signal: 'SELL',
        weight: 0.2,
        reason: 'MACD bearish zero cross',
        strength: Math.min(Math.abs(current.MACD) / 50, 1)
      };
    }

    return { signal: 'NEUTRAL', weight: 0, reason: 'No MACD signal' };
  }

  analyzeMACDDivergence(prices, macdData) {
    if (prices.length < 10 || macdData.length < 10) {
      return { signal: 'NEUTRAL', weight: 0, reason: 'Insufficient data for MACD divergence' };
    }

    const recentPrices = prices.slice(-this.config.divergence.lookback);
    const recentMACD = macdData.slice(-this.config.divergence.lookback);

    // Find price peaks and troughs
    const priceHigh = Math.max(...recentPrices);
    const priceLow = Math.min(...recentPrices);
    const priceHighIndex = recentPrices.lastIndexOf(priceHigh);
    const priceLowIndex = recentPrices.lastIndexOf(priceLow);

    // Find MACD peaks and troughs
    const macdValues = recentMACD.map(m => m.MACD);
    const macdHigh = Math.max(...macdValues);
    const macdLow = Math.min(...macdValues);
    const macdHighIndex = macdValues.lastIndexOf(macdHigh);
    const macdLowIndex = macdValues.lastIndexOf(macdLow);

    // Bullish divergence: price makes lower low, MACD makes higher low
    if (priceLowIndex > 5 && macdLowIndex > 5) {
      const prevPriceLows = recentPrices.slice(0, priceLowIndex);
      const prevMACDLows = macdValues.slice(0, macdLowIndex);
      
      if (prevPriceLows.length > 0 && prevMACDLows.length > 0) {
        const prevPriceLow = Math.min(...prevPriceLows);
        const prevMACDLow = Math.min(...prevMACDLows);
        
        if (priceLow < prevPriceLow && macdLow > prevMACDLow) {
          return {
            signal: 'BUY',
            weight: 0.4,
            reason: 'MACD bullish divergence detected',
            strength: this.config.divergence.minStrength
          };
        }
      }
    }

    // Bearish divergence: price makes higher high, MACD makes lower high
    if (priceHighIndex > 5 && macdHighIndex > 5) {
      const prevPriceHighs = recentPrices.slice(0, priceHighIndex);
      const prevMACDHighs = macdValues.slice(0, macdHighIndex);
      
      if (prevPriceHighs.length > 0 && prevMACDHighs.length > 0) {
        const prevPriceHigh = Math.max(...prevPriceHighs);
        const prevMACDHigh = Math.max(...prevMACDHighs);
        
        if (priceHigh > prevPriceHigh && macdHigh < prevMACDHigh) {
          return {
            signal: 'SELL',
            weight: 0.4,
            reason: 'MACD bearish divergence detected',
            strength: this.config.divergence.minStrength
          };
        }
      }
    }

    return { signal: 'NEUTRAL', weight: 0, reason: 'No MACD divergence' };
  }

  analyzeRSISignal(rsiData) {
    if (rsiData.length < 3) {
      return { signal: 'NEUTRAL', weight: 0, reason: 'RSI insufficient data' };
    }

    const current = rsiData[rsiData.length - 1];
    const previous = rsiData[rsiData.length - 2];

    // Traditional RSI levels
    if (current < this.config.rsi.oversold) {
      return {
        signal: 'BUY',
        weight: 0.25,
        reason: `RSI oversold (${current.toFixed(2)})`,
        strength: (this.config.rsi.oversold - current) / this.config.rsi.oversold
      };
    }

    if (current > this.config.rsi.overbought) {
      return {
        signal: 'SELL',
        weight: 0.25,
        reason: `RSI overbought (${current.toFixed(2)})`,
        strength: (current - this.config.rsi.overbought) / (100 - this.config.rsi.overbought)
      };
    }

    // RSI momentum shift
    if (previous < 50 && current > 50) {
      return {
        signal: 'BUY',
        weight: 0.15,
        reason: 'RSI bullish momentum shift',
        strength: (current - 50) / 50
      };
    }

    if (previous > 50 && current < 50) {
      return {
        signal: 'SELL',
        weight: 0.15,
        reason: 'RSI bearish momentum shift',
        strength: (50 - current) / 50
      };
    }

    return { signal: 'NEUTRAL', weight: 0, reason: 'RSI neutral' };
  }

  analyzeRSIDivergence(prices, rsiData) {
    if (prices.length < 10 || rsiData.length < 10) {
      return { signal: 'NEUTRAL', weight: 0, reason: 'Insufficient data for RSI divergence' };
    }

    const recentPrices = prices.slice(-this.config.divergence.lookback);
    const recentRSI = rsiData.slice(-this.config.divergence.lookback);

    const priceHigh = Math.max(...recentPrices);
    const priceLow = Math.min(...recentPrices);
    const priceHighIndex = recentPrices.lastIndexOf(priceHigh);
    const priceLowIndex = recentPrices.lastIndexOf(priceLow);

    const rsiHigh = Math.max(...recentRSI);
    const rsiLow = Math.min(...recentRSI);
    const rsiHighIndex = recentRSI.lastIndexOf(rsiHigh);
    const rsiLowIndex = recentRSI.lastIndexOf(rsiLow);

    // Bullish divergence
    if (priceLowIndex > 5 && rsiLowIndex > 5) {
      const prevPriceLows = recentPrices.slice(0, priceLowIndex);
      const prevRSILows = recentRSI.slice(0, rsiLowIndex);
      
      if (prevPriceLows.length > 0 && prevRSILows.length > 0) {
        const prevPriceLow = Math.min(...prevPriceLows);
        const prevRSILow = Math.min(...prevRSILows);
        
        if (priceLow < prevPriceLow && rsiLow > prevRSILow) {
          return {
            signal: 'BUY',
            weight: 0.35,
            reason: 'RSI bullish divergence',
            strength: this.config.divergence.minStrength
          };
        }
      }
    }

    // Bearish divergence
    if (priceHighIndex > 5 && rsiHighIndex > 5) {
      const prevPriceHighs = recentPrices.slice(0, priceHighIndex);
      const prevRSIHighs = recentRSI.slice(0, rsiHighIndex);
      
      if (prevPriceHighs.length > 0 && prevRSIHighs.length > 0) {
        const prevPriceHigh = Math.max(...prevPriceHighs);
        const prevRSIHigh = Math.max(...prevRSIHighs);
        
        if (priceHigh > prevPriceHigh && rsiHigh < prevRSIHigh) {
          return {
            signal: 'SELL',
            weight: 0.35,
            reason: 'RSI bearish divergence',
            strength: this.config.divergence.minStrength
          };
        }
      }
    }

    return { signal: 'NEUTRAL', weight: 0, reason: 'No RSI divergence' };
  }

  analyzeStochRSI(stochRsiData) {
    if (!stochRsiData || stochRsiData.length < 2) {
      return { signal: 'NEUTRAL', weight: 0, reason: 'StochRSI insufficient data' };
    }

    const current = stochRsiData[stochRsiData.length - 1];
    const previous = stochRsiData[stochRsiData.length - 2];

    // StochRSI crossover
    if (current.k > current.d && previous.k <= previous.d && current.k < 0.2) {
      return {
        signal: 'BUY',
        weight: 0.2,
        reason: 'StochRSI bullish crossover in oversold',
        strength: (0.2 - current.k) / 0.2
      };
    }

    if (current.k < current.d && previous.k >= previous.d && current.k > 0.8) {
      return {
        signal: 'SELL',
        weight: 0.2,
        reason: 'StochRSI bearish crossover in overbought',
        strength: (current.k - 0.8) / 0.2
      };
    }

    return { signal: 'NEUTRAL', weight: 0, reason: 'No StochRSI signal' };
  }

  analyzeEMACrossover(emaFast, emaSlow) {
    if (emaFast.length < 2 || emaSlow.length < 2) {
      return { signal: 'NEUTRAL', weight: 0, reason: 'EMA insufficient data' };
    }

    const currentFast = emaFast[emaFast.length - 1];
    const currentSlow = emaSlow[emaSlow.length - 1];
    const prevFast = emaFast[emaFast.length - 2];
    const prevSlow = emaSlow[emaSlow.length - 2];

    // Golden cross
    if (prevFast <= prevSlow && currentFast > currentSlow) {
      return {
        signal: 'BUY',
        weight: 0.25,
        reason: 'EMA golden cross',
        strength: Math.min((currentFast - currentSlow) / currentSlow * 100, 1)
      };
    }

    // Death cross
    if (prevFast >= prevSlow && currentFast < currentSlow) {
      return {
        signal: 'SELL',
        weight: 0.25,
        reason: 'EMA death cross',
        strength: Math.min((currentSlow - currentFast) / currentFast * 100, 1)
      };
    }

    return { signal: 'NEUTRAL', weight: 0, reason: 'No EMA crossover' };
  }

  analyzeBollingerBands(currentPrice, bbData) {
    if (!bbData || bbData.length === 0) {
      return { signal: 'NEUTRAL', weight: 0, reason: 'BB data unavailable' };
    }

    const current = bbData[bbData.length - 1];
    const bbWidth = (current.upper - current.lower) / current.middle;

    // Bollinger Band squeeze
    if (bbWidth < 0.04) {
      return {
        signal: 'HOLD',
        weight: 0.1,
        reason: 'Bollinger Band squeeze - low volatility',
        strength: 0.5
      };
    }

    // Price touch bands
    const distanceToLower = (currentPrice - current.lower) / current.lower;
    const distanceToUpper = (current.upper - currentPrice) / currentPrice;

    if (distanceToLower < 0.01) {
      return {
        signal: 'BUY',
        weight: 0.2,
        reason: 'Price near lower Bollinger Band',
        strength: Math.min(Math.abs(distanceToLower) * 100, 1)
      };
    }

    if (distanceToUpper < 0.01) {
      return {
        signal: 'SELL',
        weight: 0.2,
        reason: 'Price near upper Bollinger Band',
        strength: Math.min(Math.abs(distanceToUpper) * 100, 1)
      };
    }

    return { signal: 'NEUTRAL', weight: 0, reason: 'Price within BB range' };
  }

  analyzeConfluence(signals) {
    const buySignals = signals.filter(s => s.signal === 'BUY');
    const sellSignals = signals.filter(s => s.signal === 'SELL');

    // Strong confluence bonus
    if (buySignals.length >= 3) {
      return {
        signal: 'BUY',
        weight: 0.1,
        reason: `Strong bullish confluence (${buySignals.length} signals)`,
        strength: Math.min(buySignals.length / 5, 1)
      };
    }

    if (sellSignals.length >= 3) {
      return {
        signal: 'SELL',
        weight: 0.1,
        reason: `Strong bearish confluence (${sellSignals.length} signals)`,
        strength: Math.min(sellSignals.length / 5, 1)
      };
    }

    return { signal: 'NEUTRAL', weight: 0, reason: 'No confluence' };
  }

  combineSignals(signals) {
    if (signals.length === 0) {
      return this.createSignal('HOLD', 0, 'No signals generated');
    }

    let buyWeight = 0;
    let sellWeight = 0;
    let holdWeight = 0;
    const reasons = [];

    signals.forEach(signal => {
      const adjustedWeight = signal.weight * (signal.strength || 1);
      
      if (signal.signal === 'BUY') {
        buyWeight += adjustedWeight;
        reasons.push(`${signal.reason} (+${(adjustedWeight * 100).toFixed(1)}%)`);
      } else if (signal.signal === 'SELL') {
        sellWeight += adjustedWeight;
        reasons.push(`${signal.reason} (-${(adjustedWeight * 100).toFixed(1)}%)`);
      } else if (signal.signal === 'HOLD') {
        holdWeight += adjustedWeight;
        reasons.push(`${signal.reason} (=${(adjustedWeight * 100).toFixed(1)}%)`);
      }
    });

    const netSignal = buyWeight - sellWeight;
    const confidence = Math.min(Math.abs(netSignal) + (holdWeight * 0.1), 1);

    // Higher thresholds for enhanced strategy
    if (netSignal > 0.15) {
      return this.createSignal('BUY', confidence, reasons.join(' | '));
    } else if (netSignal < -0.15) {
      return this.createSignal('SELL', confidence, reasons.join(' | '));
    } else {
      return this.createSignal('HOLD', confidence, 'Insufficient signal strength or conflicting signals');
    }
  }

  applyAdvancedRiskFilters(signal, indicators) {
    // Volatility filter using Bollinger Band width
    if (indicators.bollinger && indicators.bollinger.length > 0) {
      const bb = indicators.bollinger[indicators.bollinger.length - 1];
      const volatility = (bb.upper - bb.lower) / bb.middle;
      
      if (volatility > 0.1 && signal.confidence < 0.8) {
        return this.createSignal(
          'HOLD',
          signal.confidence * 0.6,
          `High volatility (${(volatility * 100).toFixed(1)}%) - reducing confidence`
        );
      }
    }

    // Market structure filter
    const trend = this.determineTrend(indicators);
    if (trend === 'SIDEWAYS' && signal.action !== 'HOLD') {
      return this.createSignal(
        'HOLD',
        signal.confidence * 0.7,
        'Sideways market - avoiding directional trades'
      );
    }

    // Recent performance filter
    const recentPerformance = this.getRecentSignalPerformance(5);
    if (recentPerformance < 0.3) {
      return this.createSignal(
        signal.action,
        signal.confidence * 0.5,
        'Recent poor performance - reducing confidence'
      );
    }

    return signal;
  }

  determineTrend(indicators) {
    if (!indicators.emaFast || !indicators.emaSlow || indicators.emaFast.length < 5) {
      return 'UNKNOWN';
    }

    const fastEMA = indicators.emaFast.slice(-5);
    const slowEMA = indicators.emaSlow.slice(-5);
    
    const fastTrend = this.calculateTrendDirection(fastEMA);
    const slowTrend = this.calculateTrendDirection(slowEMA);
    
    if (fastTrend > 0 && slowTrend > 0 && fastEMA[4] > slowEMA[4]) {
      return 'BULLISH';
    } else if (fastTrend < 0 && slowTrend < 0 && fastEMA[4] < slowEMA[4]) {
      return 'BEARISH';
    } else {
      return 'SIDEWAYS';
    }
  }

  calculateTrendDirection(values) {
    if (values.length < 3) return 0;
    
    const first = values[0];
    const last = values[values.length - 1];
    return (last - first) / first;
  }

  getRecentSignalPerformance(count) {
    if (this.signalHistory.length < count) {
      return 0.5; // Neutral if insufficient history
    }

    const recentSignals = this.signalHistory.slice(-count);
    const successfulSignals = recentSignals.filter(signal => 
      signal.performance && signal.performance > 0
    ).length;

    return successfulSignals / count;
  }

  simplifyIndicators(indicators) {
    return {
      macd: indicators.macd ? indicators.macd[indicators.macd.length - 1] : null,
      rsi: indicators.rsi ? indicators.rsi[indicators.rsi.length - 1] : null,
      stochRsi: indicators.stochRsi ? indicators.stochRsi[indicators.stochRsi.length - 1] : null,
      bollinger: indicators.bollinger ? indicators.bollinger[indicators.bollinger.length - 1] : null,
      emaFast: indicators.emaFast ? indicators.emaFast[indicators.emaFast.length - 1] : null,
      emaSlow: indicators.emaSlow ? indicators.emaSlow[indicators.emaSlow.length - 1] : null
    };
  }

  logAnalysis(signal, signals, indicators) {
    logger.gooseDecision(`Enhanced Strategy Signal: ${signal.action}`, {
      confidence: signal.confidence.toFixed(3),
      reason: signal.reason,
      signalCount: signals.length,
      buySignals: signals.filter(s => s.signal === 'BUY').length,
      sellSignals: signals.filter(s => s.signal === 'SELL').length,
      holdSignals: signals.filter(s => s.signal === 'HOLD').length,
      indicators: this.simplifyIndicators(indicators)
    });
  }

  createSignal(action, confidence, reason) {
    return {
      action,
      confidence: Math.min(Math.max(confidence, 0), 1),
      reason,
      timestamp: new Date().toISOString(),
      strategy: 'enhanced'
    };
  }

  getSignalHistory(count = 10) {
    return this.signalHistory.slice(-count);
  }

  getStrategyMetrics() {
    return {
      totalSignals: this.signalHistory.length,
      recentPerformance: this.getRecentSignalPerformance(10),
      lastSignal: this.lastSignal,
      strategyType: 'Enhanced Multi-Indicator Strategy',
      indicators: Object.keys(this.config)
    };
  }

  reset() {
    this.lastSignal = null;
    this.signalHistory = [];
    this.priceHistory = [];
    this.rsiHistory = [];
    this.macdHistory = [];
    logger.info('Enhanced strategy reset');
  }
}

module.exports = EnhancedTradingStrategy;