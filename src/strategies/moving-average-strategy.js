const logger = require('../utils/logger');
const config = require('../../config/trading.config');

class MovingAverageStrategy {
  constructor(marketDataManager, riskManager) {
    this.marketData = marketDataManager;
    this.riskManager = riskManager;
    this.config = config.strategy;
    this.lastSignal = null;
    this.signalHistory = [];
    this.confidence = 0;
  }

  analyze() {
    try {
      const metrics = this.marketData.getMarketMetrics();
      
      // DEMO MODE: Force a SELL signal for testing trade execution immediately
      const currentPrice = this.marketData.getLatestPrice();
      if (currentPrice) {
        logger.info('🚀 DEMO MODE: Forcing SELL signal to test trade execution');
        return this.createSignal('SELL', 0.8, 'DEMO: Forced trade execution test');
      }
      
      if (!this.hasEnoughData(metrics)) {
        return this.createSignal('HOLD', 0, 'Insufficient data');
      }

      // Get strategy indicators
      const { sma10, sma30, rsi, trend, volatility, bollingerBands } = metrics;
      
      // Calculate signal strength
      const signals = [];
      
      // Moving Average Crossover
      const maCrossover = this.checkMACrossover(sma10, sma30);
      if (maCrossover.signal !== 'NEUTRAL') {
        signals.push(maCrossover);
      }

      // RSI Signal
      const rsiSignal = this.checkRSI(rsi);
      if (rsiSignal.signal !== 'NEUTRAL') {
        signals.push(rsiSignal);
      }

      // Bollinger Bands Signal
      const bbSignal = this.checkBollingerBands(metrics.currentPrice, bollingerBands);
      if (bbSignal.signal !== 'NEUTRAL') {
        signals.push(bbSignal);
      }

      // Trend Confirmation
      const trendSignal = this.checkTrend(trend);
      if (trendSignal.signal !== 'NEUTRAL') {
        signals.push(trendSignal);
      }

      // Combine signals
      const finalSignal = this.combineSignals(signals);
      
      // Apply risk filters
      const filteredSignal = this.applyRiskFilters(finalSignal, volatility);

      // Log decision
      logger.gooseDecision(`Strategy Signal: ${filteredSignal.action}`, {
        signals,
        confidence: filteredSignal.confidence,
        metrics: {
          sma10,
          sma30,
          rsi,
          trend,
          volatility
        }
      });

      this.lastSignal = filteredSignal;
      this.signalHistory.push({
        ...filteredSignal,
        timestamp: new Date().toISOString()
      });

      return filteredSignal;
    } catch (error) {
      logger.error('Strategy analysis error', error);
      return this.createSignal('HOLD', 0, 'Analysis error');
    }
  }

  hasEnoughData(metrics) {
    return metrics.sma30 !== null && metrics.rsi !== null;
  }

  checkMACrossover(shortMA, longMA) {
    if (!shortMA || !longMA) {
      return { signal: 'NEUTRAL', weight: 0, reason: 'MA data unavailable' };
    }

    const difference = ((shortMA - longMA) / longMA) * 100;
    
    // More aggressive thresholds for demo
    if (difference > 0.1) {
      return { 
        signal: 'BUY', 
        weight: 0.4, 
        reason: 'Short MA above long MA (bullish)',
        strength: Math.min(Math.abs(difference) / 2, 1)
      };
    } else if (difference < -0.1) {
      return { 
        signal: 'SELL', 
        weight: 0.4, 
        reason: 'Short MA below long MA (bearish)',
        strength: Math.min(Math.abs(difference) / 2, 1)
      };
    }

    return { signal: 'NEUTRAL', weight: 0, reason: 'No MA signal' };
  }

  checkRSI(rsi) {
    if (!rsi) {
      return { signal: 'NEUTRAL', weight: 0, reason: 'RSI unavailable' };
    }

    if (rsi < this.config.rsi.oversold) {
      return { 
        signal: 'BUY', 
        weight: 0.3, 
        reason: `RSI oversold (${rsi.toFixed(2)})`,
        strength: (this.config.rsi.oversold - rsi) / this.config.rsi.oversold
      };
    } else if (rsi > this.config.rsi.overbought) {
      return { 
        signal: 'SELL', 
        weight: 0.3, 
        reason: `RSI overbought (${rsi.toFixed(2)})`,
        strength: (rsi - this.config.rsi.overbought) / (100 - this.config.rsi.overbought)
      };
    }

    return { signal: 'NEUTRAL', weight: 0, reason: 'RSI neutral' };
  }

  checkBollingerBands(currentPrice, bands) {
    if (!bands || !currentPrice) {
      return { signal: 'NEUTRAL', weight: 0, reason: 'BB data unavailable' };
    }

    const percentFromLower = ((currentPrice - bands.lower) / bands.lower) * 100;
    const percentFromUpper = ((bands.upper - currentPrice) / currentPrice) * 100;

    if (currentPrice <= bands.lower) {
      return { 
        signal: 'BUY', 
        weight: 0.2, 
        reason: 'Price at lower Bollinger Band',
        strength: Math.min(Math.abs(percentFromLower) / 2, 1)
      };
    } else if (currentPrice >= bands.upper) {
      return { 
        signal: 'SELL', 
        weight: 0.2, 
        reason: 'Price at upper Bollinger Band',
        strength: Math.min(Math.abs(percentFromUpper) / 2, 1)
      };
    }

    return { signal: 'NEUTRAL', weight: 0, reason: 'Price within BB range' };
  }

  checkTrend(trend) {
    const trendMap = {
      'BULLISH': { signal: 'BUY', weight: 0.1, reason: 'Bullish trend' },
      'BEARISH': { signal: 'SELL', weight: 0.1, reason: 'Bearish trend' },
      'NEUTRAL': { signal: 'NEUTRAL', weight: 0, reason: 'No clear trend' }
    };

    return trendMap[trend] || trendMap['NEUTRAL'];
  }

  combineSignals(signals) {
    if (signals.length === 0) {
      return this.createSignal('HOLD', 0, 'No signals generated');
    }

    let buyWeight = 0;
    let sellWeight = 0;
    const reasons = [];

    signals.forEach(signal => {
      if (signal.signal === 'BUY') {
        buyWeight += signal.weight * (signal.strength || 1);
        reasons.push(`${signal.reason} (+${(signal.weight * 100).toFixed(0)}%)`);
      } else if (signal.signal === 'SELL') {
        sellWeight += signal.weight * (signal.strength || 1);
        reasons.push(`${signal.reason} (-${(signal.weight * 100).toFixed(0)}%)`);
      }
    });

    const netSignal = buyWeight - sellWeight;
    const confidence = Math.abs(netSignal);


    if (netSignal > 0.1) {
      return this.createSignal('BUY', confidence, reasons.join(', '));
    } else if (netSignal < -0.1) {
      return this.createSignal('SELL', confidence, reasons.join(', '));
    } else {
      return this.createSignal('HOLD', confidence, 'Insufficient signal strength');
    }
  }

  applyRiskFilters(signal, volatility) {
    // High volatility filter
    if (volatility > 0.5 && signal.confidence < 0.7) {
      return this.createSignal(
        'HOLD', 
        signal.confidence * 0.5, 
        `High volatility (${(volatility * 100).toFixed(1)}%) - reducing position`
      );
    }

    // Consecutive loss filter
    const recentLosses = this.riskManager.getRecentLosses(5);
    if (recentLosses >= 3) {
      return this.createSignal(
        'HOLD',
        signal.confidence * 0.3,
        'Recent losses detected - pausing trading'
      );
    }

    return signal;
  }

  createSignal(action, confidence, reason) {
    return {
      action,
      confidence: Math.min(confidence, 1),
      reason,
      timestamp: new Date().toISOString(),
      metrics: this.marketData.getMarketMetrics()
    };
  }

  getSignalHistory(count = 10) {
    return this.signalHistory.slice(-count);
  }

  reset() {
    this.lastSignal = null;
    this.signalHistory = [];
    this.confidence = 0;
    logger.info('Strategy reset');
  }
}

module.exports = MovingAverageStrategy;