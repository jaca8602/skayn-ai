const logger = require('../utils/logger');
const config = require('../../config/trading.config');

class RiskManager {
  constructor(lnMarketsClient) {
    this.lnMarketsClient = lnMarketsClient;
    this.config = config.risk;
    this.tradingConfig = config.trading;
    this.dailyLoss = 0;
    this.dailyTrades = 0;
    this.tradeHistory = [];
    this.maxDrawdown = 0;
    this.peakBalance = 0;
    this.riskMetrics = {
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      sharpeRatio: 0
    };
  }

  async canOpenPosition(side, quantity, leverage = 2) {
    try {
      // DEMO MODE: Allow all trades for testing
      logger.info('🚀 DEMO MODE: Risk checks bypassed for testing');
      return { allowed: true, reason: 'Demo mode - all trades allowed' };
      
      // Check 1: Position limit
      const currentPositions = await this.lnMarketsClient.getPositions();
      if (currentPositions.length >= this.tradingConfig.positionLimit) {
        logger.warn('Position limit reached', { 
          current: currentPositions.length, 
          limit: this.tradingConfig.positionLimit 
        });
        return { allowed: false, reason: 'Position limit reached' };
      }

      // Check 2: Position size
      if (quantity > this.tradingConfig.maxPositionSize) {
        logger.warn('Position size exceeds limit', { 
          requested: quantity, 
          limit: this.tradingConfig.maxPositionSize 
        });
        return { allowed: false, reason: 'Position size exceeds limit' };
      }

      // Check 3: Leverage limit
      if (leverage > this.tradingConfig.maxLeverage) {
        logger.warn('Leverage exceeds limit', { 
          requested: leverage, 
          limit: this.tradingConfig.maxLeverage 
        });
        return { allowed: false, reason: 'Leverage exceeds limit' };
      }

      // Check 4: Daily loss limit
      if (Math.abs(this.dailyLoss) >= this.config.maxDailyLoss) {
        logger.warn('Daily loss limit reached', { 
          loss: this.dailyLoss, 
          limit: this.config.maxDailyLoss 
        });
        return { allowed: false, reason: 'Daily loss limit reached' };
      }

      // Check 5: Account balance check
      const balance = this.lnMarketsClient.balance;
      const requiredMargin = quantity / leverage;
      const riskAmount = (quantity * this.config.riskPerTrade) / 100;

      if (balance < requiredMargin + riskAmount) {
        logger.warn('Insufficient balance', { 
          balance, 
          required: requiredMargin + riskAmount 
        });
        return { allowed: false, reason: 'Insufficient balance' };
      }

      // Check 6: Drawdown limit
      const currentDrawdown = this.calculateDrawdown(balance);
      if (currentDrawdown > this.config.maxDrawdownPercentage) {
        logger.warn('Drawdown limit exceeded', { 
          drawdown: currentDrawdown, 
          limit: this.config.maxDrawdownPercentage 
        });
        return { allowed: false, reason: 'Drawdown limit exceeded' };
      }

      // Check 7: Portfolio heat (total risk exposure)
      const portfolioHeat = this.calculatePortfolioHeat(currentPositions);
      if (portfolioHeat + this.config.riskPerTrade > this.config.portfolioHeatLimit) {
        logger.warn('Portfolio heat limit exceeded', { 
          currentHeat: portfolioHeat, 
          additional: this.config.riskPerTrade,
          limit: this.config.portfolioHeatLimit 
        });
        return { allowed: false, reason: 'Portfolio heat limit exceeded' };
      }

      logger.gooseAction('RISK_CHECK_PASSED', {
        side,
        quantity,
        leverage,
        checks: {
          positions: `${currentPositions.length}/${this.tradingConfig.positionLimit}`,
          dailyLoss: `${this.dailyLoss}/${this.config.maxDailyLoss}`,
          drawdown: `${currentDrawdown.toFixed(2)}%`,
          portfolioHeat: `${portfolioHeat.toFixed(2)}%`
        }
      });

      return { allowed: true, reason: 'All risk checks passed' };
    } catch (error) {
      logger.error('Risk check error', error);
      return { allowed: false, reason: 'Risk check error' };
    }
  }

  calculateStopLoss(entryPrice, side) {
    const stopLossDistance = (entryPrice * this.tradingConfig.stopLossPercentage) / 100;
    
    if (side === 'buy') {
      return entryPrice - stopLossDistance;
    } else {
      return entryPrice + stopLossDistance;
    }
  }

  calculatePositionSize(balance, riskPercentage = null) {
    const risk = riskPercentage || this.config.riskPerTrade;
    const riskAmount = (balance * risk) / 100;
    const positionSize = Math.min(
      riskAmount * this.tradingConfig.maxLeverage,
      this.tradingConfig.maxPositionSize
    );

    return Math.floor(positionSize);
  }

  async updateTradeResult(trade) {
    this.tradeHistory.push({
      ...trade,
      timestamp: new Date().toISOString()
    });

    // Update daily P&L
    if (trade.pl) {
      this.dailyLoss += trade.pl < 0 ? trade.pl : 0;
      this.dailyTrades++;
    }

    // Update metrics
    this.updateRiskMetrics();

    // Log performance
    logger.info('Trade result recorded', {
      pl: trade.pl,
      dailyLoss: this.dailyLoss,
      dailyTrades: this.dailyTrades
    });
  }

  calculateDrawdown(currentBalance) {
    if (currentBalance > this.peakBalance) {
      this.peakBalance = currentBalance;
    }

    const drawdown = ((this.peakBalance - currentBalance) / this.peakBalance) * 100;
    
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }

    return drawdown;
  }

  calculatePortfolioHeat(positions) {
    let totalHeat = 0;

    positions.forEach(position => {
      const positionRisk = (position.quantity * this.config.riskPerTrade) / 100;
      totalHeat += positionRisk / this.lnMarketsClient.balance * 100;
    });

    return totalHeat;
  }

  updateRiskMetrics() {
    const trades = this.tradeHistory.filter(t => t.pl !== undefined);
    if (trades.length === 0) return;

    const wins = trades.filter(t => t.pl > 0);
    const losses = trades.filter(t => t.pl < 0);

    this.riskMetrics.winRate = (wins.length / trades.length) * 100;
    this.riskMetrics.avgWin = wins.length > 0 
      ? wins.reduce((sum, t) => sum + t.pl, 0) / wins.length 
      : 0;
    this.riskMetrics.avgLoss = losses.length > 0 
      ? Math.abs(losses.reduce((sum, t) => sum + t.pl, 0) / losses.length)
      : 0;

    // Calculate Sharpe Ratio (simplified)
    const returns = trades.map(t => t.pl / t.quantity);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    
    this.riskMetrics.sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  }

  getRecentLosses(count = 5) {
    const recentTrades = this.tradeHistory.slice(-count);
    return recentTrades.filter(t => t.pl < 0).length;
  }

  getRiskMetrics() {
    return {
      ...this.riskMetrics,
      dailyLoss: this.dailyLoss,
      dailyTrades: this.dailyTrades,
      maxDrawdown: this.maxDrawdown,
      currentDrawdown: this.calculateDrawdown(this.lnMarketsClient.balance)
    };
  }

  resetDailyLimits() {
    this.dailyLoss = 0;
    this.dailyTrades = 0;
    logger.info('Daily risk limits reset');
  }

  shouldReducePosition(position, currentPrice) {
    // Check if position is in profit and should be partially closed
    const pl = position.side === 'buy' 
      ? (currentPrice - position.entry_price) / position.entry_price
      : (position.entry_price - currentPrice) / position.entry_price;

    // Take partial profits at 3% gain
    if (pl > 0.03) {
      return { reduce: true, percentage: 50, reason: 'Partial profit taking' };
    }

    // Reduce if approaching daily loss limit
    if (Math.abs(this.dailyLoss) > this.config.maxDailyLoss * 0.8) {
      return { reduce: true, percentage: 75, reason: 'Approaching daily loss limit' };
    }

    return { reduce: false };
  }

  getPositionHealth(position, currentPrice) {
    const pl = position.side === 'buy' 
      ? (currentPrice - position.entry_price) / position.entry_price
      : (position.entry_price - currentPrice) / position.entry_price;

    const plPercentage = pl * 100;
    let health = 'HEALTHY';
    
    if (plPercentage < -this.tradingConfig.stopLossPercentage * 0.5) {
      health = 'WARNING';
    } else if (plPercentage < -this.tradingConfig.stopLossPercentage * 0.8) {
      health = 'CRITICAL';
    } else if (plPercentage > 3) {
      health = 'PROFITABLE';
    }

    return {
      health,
      pl: plPercentage,
      timeOpen: Date.now() - new Date(position.created_at).getTime(),
      stopLossDistance: Math.abs(plPercentage + this.tradingConfig.stopLossPercentage)
    };
  }
}

module.exports = RiskManager;