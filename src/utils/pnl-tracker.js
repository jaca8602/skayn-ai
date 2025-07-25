const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class PnLTracker {
  constructor() {
    this.pnlFile = path.join(__dirname, '../../logs/pnl-history.json');
    this.dailyPnL = 0;
    this.totalPnL = 0;
    this.trades = [];
    this.openPositions = new Map();
    this.loadPnLHistory();
  }

  loadPnLHistory() {
    try {
      if (fs.existsSync(this.pnlFile)) {
        const data = JSON.parse(fs.readFileSync(this.pnlFile, 'utf8'));
        this.totalPnL = data.totalPnL || 0;
        this.trades = data.trades || [];
        this.openPositions = new Map(data.openPositions || []);
        
        // Calculate today's P&L
        const today = new Date().toDateString();
        this.dailyPnL = this.trades
          .filter(trade => new Date(trade.timestamp).toDateString() === today)
          .reduce((sum, trade) => sum + (trade.realizedPnL || 0), 0);
          
        logger.info(`📊 P&L History Loaded: Total: $${this.totalPnL.toFixed(2)}, Today: $${this.dailyPnL.toFixed(2)}`);
      }
    } catch (error) {
      logger.error('Failed to load P&L history', error);
    }
  }

  savePnLHistory() {
    try {
      const data = {
        totalPnL: this.totalPnL,
        dailyPnL: this.dailyPnL,
        trades: this.trades,
        openPositions: Array.from(this.openPositions.entries()),
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(this.pnlFile, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to save P&L history', error);
    }
  }

  recordPosition(position) {
    this.openPositions.set(position.id, {
      ...position,
      openTime: new Date().toISOString(),
      unrealizedPnL: 0
    });
    this.savePnLHistory();
    
    logger.info(`💼 Position Recorded: ${position.id}`, {
      side: position.side.toUpperCase(),
      quantity: position.quantity,
      entryPrice: `$${position.entry_price?.toLocaleString()}`
    });
  }

  updatePositionPnL(positions, currentPrice) {
    let totalUnrealizedPnL = 0;
    
    positions.forEach(position => {
      if (this.openPositions.has(position.id)) {
        const storedPosition = this.openPositions.get(position.id);
        const isLong = position.side === 'b'; // LN Markets API uses 'b' for buy/long, 's' for sell/short
        
        // Calculate unrealized P&L
        const priceDiff = isLong ? 
          (currentPrice - position.entry_price) : 
          (position.entry_price - currentPrice);
        
        const unrealizedPnL = priceDiff * position.quantity;
        const unrealizedPnLPercent = (priceDiff / position.entry_price) * 100 * position.leverage;
        
        // Calculate accumulated fees
        const hoursOpen = (Date.now() - new Date(storedPosition.openTime).getTime()) / (1000 * 60 * 60);
        const accumulatedFees = position.fees ? 
          position.fees.opening + (position.fees.totalDailyCost * hoursOpen / 24) : 0;
        
        // Net unrealized P&L
        const netUnrealizedPnL = unrealizedPnL - accumulatedFees;
        
        // Update stored position
        storedPosition.unrealizedPnL = netUnrealizedPnL;
        storedPosition.currentPrice = currentPrice;
        storedPosition.accumulatedFees = accumulatedFees;
        
        totalUnrealizedPnL += netUnrealizedPnL;
      }
    });
    
    return totalUnrealizedPnL;
  }

  closePosition(positionId, exitPrice, exitTime = new Date().toISOString()) {
    const position = this.openPositions.get(positionId);
    if (!position) {
      logger.warn(`Position ${positionId} not found for closing`);
      return null;
    }

    const isLong = position.side === 'b'; // LN Markets API uses 'b' for buy/long, 's' for sell/short
    const priceDiff = isLong ? 
      (exitPrice - position.entry_price) : 
      (position.entry_price - exitPrice);
    
    const realizedPnL = priceDiff * position.quantity;
    const realizedPnLPercent = (priceDiff / position.entry_price) * 100 * position.leverage;
    
    // Calculate total fees
    const hoursOpen = (new Date(exitTime).getTime() - new Date(position.openTime).getTime()) / (1000 * 60 * 60);
    const totalFees = position.fees ? 
      position.fees.opening + position.fees.closingEstimated + (position.fees.totalDailyCost * hoursOpen / 24) : 0;
    
    // Net realized P&L
    const netRealizedPnL = realizedPnL - totalFees;

    // Record the trade
    const trade = {
      id: positionId,
      side: position.side,
      quantity: position.quantity,
      entryPrice: position.entry_price,
      exitPrice: exitPrice,
      entryTime: position.openTime,
      exitTime: exitTime,
      duration: `${hoursOpen.toFixed(1)}h`,
      grossPnL: realizedPnL,
      totalFees: totalFees,
      realizedPnL: netRealizedPnL,
      realizedPnLPercent: realizedPnLPercent,
      leverage: position.leverage,
      timestamp: exitTime
    };

    this.trades.push(trade);
    this.totalPnL += netRealizedPnL;
    this.dailyPnL += netRealizedPnL;
    this.openPositions.delete(positionId);
    this.savePnLHistory();

    // Log the closed position
    const pnlEmoji = netRealizedPnL > 0 ? '💰' : '📉';
    const pnlColor = netRealizedPnL > 0 ? '✅' : '❌';
    
    logger.info(`🔒 POSITION CLOSED ${pnlEmoji}`, {
      positionId: positionId,
      side: position.side.toUpperCase(),
      duration: trade.duration,
      grossPnL: `$${realizedPnL.toFixed(2)}`,
      fees: `-$${totalFees.toFixed(2)}`,
      netPnL: `${pnlColor} $${netRealizedPnL.toFixed(2)} (${realizedPnLPercent.toFixed(2)}%)`
    });

    return trade;
  }

  getPnLSummary() {
    const totalTrades = this.trades.length;
    const winningTrades = this.trades.filter(t => t.realizedPnL > 0).length;
    const losingTrades = this.trades.filter(t => t.realizedPnL < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    const avgWin = winningTrades > 0 ? 
      this.trades.filter(t => t.realizedPnL > 0).reduce((sum, t) => sum + t.realizedPnL, 0) / winningTrades : 0;
    
    const avgLoss = losingTrades > 0 ? 
      this.trades.filter(t => t.realizedPnL < 0).reduce((sum, t) => sum + Math.abs(t.realizedPnL), 0) / losingTrades : 0;

    const openPositionsCount = this.openPositions.size;
    const totalUnrealizedPnL = Array.from(this.openPositions.values())
      .reduce((sum, pos) => sum + (pos.unrealizedPnL || 0), 0);

    return {
      totalPnL: this.totalPnL,
      dailyPnL: this.dailyPnL,
      totalTrades: totalTrades,
      winningTrades: winningTrades,
      losingTrades: losingTrades,
      winRate: winRate,
      avgWin: avgWin,
      avgLoss: avgLoss,
      openPositions: openPositionsCount,
      unrealizedPnL: totalUnrealizedPnL,
      netPnL: this.totalPnL + totalUnrealizedPnL
    };
  }

  logPnLSummary() {
    const summary = this.getPnLSummary();
    
    logger.info('📈 P&L SUMMARY', {
      totalPnL: `$${summary.totalPnL.toFixed(2)}`,
      dailyPnL: `$${summary.dailyPnL.toFixed(2)}`,
      unrealizedPnL: `$${summary.unrealizedPnL.toFixed(2)}`,
      netPnL: `$${summary.netPnL.toFixed(2)}`,
      winRate: `${summary.winRate.toFixed(1)}%`,
      totalTrades: summary.totalTrades,
      openPositions: summary.openPositions
    });
  }
}

module.exports = PnLTracker;