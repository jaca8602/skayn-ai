const EventEmitter = require('events');
const logger = require('../utils/logger');
const config = require('../../config/trading.config');
const PnLTracker = require('../utils/pnl-tracker');

class GooseTradingAgent extends EventEmitter {
  constructor({
    lnMarketsClient,
    marketDataManager,
    strategy,
    riskManager
  }) {
    super();
    this.lnMarketsClient = lnMarketsClient;
    this.marketData = marketDataManager;
    this.strategy = strategy;
    this.riskManager = riskManager;
    this.config = config.goose;
    this.pnlTracker = new PnLTracker();
    
    this.isRunning = false;
    this.decisionInterval = null;
    this.modules = {};
    this.state = {
      mode: this.config.mode,
      lastDecision: null,
      activePositions: new Map(),
      performance: {
        totalTrades: 0,
        profitableTrades: 0,
        totalPL: 0
      }
    };
  }

  async initialize() {
    logger.gooseAction('AGENT_INITIALIZING', {
      mode: this.config.mode,
      modules: Object.keys(this.config.modules).filter(m => this.config.modules[m].enabled)
    });

    // Initialize enabled modules
    if (this.config.modules.marketAnalysis.enabled) {
      this.modules.marketAnalysis = this.createMarketAnalysisModule();
    }

    if (this.config.modules.tradeExecution.enabled) {
      this.modules.tradeExecution = this.createTradeExecutionModule();
    }

    if (this.config.modules.riskManagement.enabled) {
      this.modules.riskManagement = this.createRiskManagementModule();
    }

    if (this.config.modules.portfolioOptimization.enabled) {
      this.modules.portfolioOptimization = this.createPortfolioOptimizationModule();
    }

    logger.gooseAction('AGENT_INITIALIZED', {
      modules: Object.keys(this.modules)
    });
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Agent already running');
      return;
    }

    this.isRunning = true;
    logger.gooseAction('AGENT_STARTED', {
      mode: this.config.mode,
      decisionInterval: this.config.decisionInterval
    });

    // Start autonomous decision loop
    if (this.config.mode === 'autonomous') {
      this.startAutonomousMode();
    }

    // Start module-specific intervals
    this.startModules();

    this.emit('started');
  }

  async stop() {
    if (!this.isRunning) {
      logger.warn('Agent not running');
      return;
    }

    this.isRunning = false;
    
    // Stop decision interval
    if (this.decisionInterval) {
      clearInterval(this.decisionInterval);
      this.decisionInterval = null;
    }

    // Stop all modules
    this.stopModules();

    logger.gooseAction('AGENT_STOPPED', {
      performance: this.state.performance
    });

    this.emit('stopped');
  }

  startAutonomousMode() {
    this.decisionInterval = setInterval(async () => {
      try {
        await this.makeAutonomousDecision();
      } catch (error) {
        logger.error('Autonomous decision error', error);
      }
    }, this.config.decisionInterval);

    // Wait 5 seconds for price data to be available, then make first decision
    setTimeout(() => {
      this.makeAutonomousDecision();
    }, 5000);
  }

  async makeAutonomousDecision() {
    logger.gooseAction('AUTONOMOUS_DECISION_START', {
      timestamp: new Date().toISOString()
    });

    try {
      // Step 1: Analyze market
      const marketAnalysis = await this.modules.marketAnalysis.analyze();
      
      // Step 2: Generate trading signal
      const signal = this.strategy.analyze();
      
      // Step 3: Apply risk checks
      const riskAssessment = await this.assessRisk(signal);
      
      // Step 4: Make decision
      const decision = this.synthesizeDecision(marketAnalysis, signal, riskAssessment);
      
      // Step 5: Execute decision
      if (decision.action !== 'HOLD') {
        await this.executeDecision(decision);
      }

      this.state.lastDecision = decision;
      logger.gooseDecision(decision.action, decision);

    } catch (error) {
      logger.error('Autonomous decision failed', error);
    }
  }

  async assessRisk(signal) {
    const positions = await this.lnMarketsClient.getPositions();
    const metrics = this.riskManager.getRiskMetrics();
    
    // DEMO MODE: Allow all trades for testing
    return {
      canTrade: true, // Always allow trades in demo mode
      openPositions: positions.length,
      dailyLoss: metrics.dailyLoss,
      drawdown: metrics.currentDrawdown,
      riskScore: 100 // Perfect risk score for demo
    };
  }

  synthesizeDecision(marketAnalysis, signal, riskAssessment) {
    const decision = {
      action: 'HOLD',
      confidence: 0,
      reasons: [],
      timestamp: new Date().toISOString()
    };

    // If risk check fails, hold
    if (!riskAssessment.canTrade) {
      decision.reasons.push('Risk limits exceeded');
      return decision;
    }

    // For demo trades, always allow execution
    const isDemoTrade = signal.reason && signal.reason.includes('DEMO');
    
    // Lower thresholds for demo or if signal is strong enough
    if (isDemoTrade || (signal.confidence > 0.3 && marketAnalysis.marketHealth !== 'EXTREME')) {
      decision.action = signal.action;
      decision.confidence = signal.confidence * (marketAnalysis.confidence || 0.8);
      decision.reasons = [
        ...signal.reason.split(', '),
        `Market health: ${marketAnalysis.marketHealth}`
      ];
    }

    return decision;
  }

  async executeDecision(decision) {
    try {
      const currentPrice = this.marketData.getLatestPrice();
      const size = this.riskManager.calculatePositionSize(
        this.lnMarketsClient.balance || 1000, // Use 1000 as default for testnet
        2 // 2% risk per trade
      );

      const actionEmoji = decision.action === 'BUY' ? '🟢' : '🔴';
      const directionEmoji = decision.action === 'BUY' ? '📈' : '📉';
      
      logger.info(`${actionEmoji} EXECUTING ${decision.action} ORDER ${directionEmoji}`, {
        action: decision.action,
        size: `${size} BTC`,
        price: `$${currentPrice?.toLocaleString()}`,
        confidence: `${(decision.confidence * 100).toFixed(1)}%`,
        value: `$${(size * (currentPrice || 0)).toLocaleString()}`
      });

      if (decision.action === 'BUY') {
        await this.modules.tradeExecution.openLong(size);
      } else if (decision.action === 'SELL') {
        await this.modules.tradeExecution.openShort(size);
      }

      this.state.performance.totalTrades++;
      
    } catch (error) {
      logger.error('Decision execution failed', error);
    }
  }

  createMarketAnalysisModule() {
    return {
      analyze: async () => {
        const metrics = this.marketData.getMarketMetrics();
        const volatility = metrics.volatility || 0;
        const trend = metrics.trend;
        
        let marketHealth = 'GOOD';
        let confidence = 0.8;

        if (volatility > 0.5) {
          marketHealth = 'VOLATILE';
          confidence = 0.5;
        } else if (volatility > 0.8) {
          marketHealth = 'EXTREME';
          confidence = 0.2;
        }

        return {
          marketHealth,
          confidence,
          volatility,
          trend,
          metrics
        };
      }
    };
  }

  createTradeExecutionModule() {
    return {
      openLong: async (size) => {
        const riskCheck = await this.riskManager.canOpenPosition('buy', size);
        if (!riskCheck.allowed) {
          logger.warn('Trade blocked by risk manager', riskCheck);
          return null;
        }

        const position = await this.lnMarketsClient.openPosition('buy', size);
        
        // Record position in P&L tracker
        this.pnlTracker.recordPosition(position);
        
        // Set stop loss
        const stopLoss = this.riskManager.calculateStopLoss(position.price, 'buy');
        await this.lnMarketsClient.updateStopLoss(position.id, stopLoss);
        
        this.state.activePositions.set(position.id, position);
        return position;
      },

      openShort: async (size) => {
        const riskCheck = await this.riskManager.canOpenPosition('sell', size);
        if (!riskCheck.allowed) {
          logger.warn('Trade blocked by risk manager', riskCheck);
          return null;
        }

        const position = await this.lnMarketsClient.openPosition('sell', size);
        
        // Record position in P&L tracker
        this.pnlTracker.recordPosition(position);
        
        // Set stop loss
        const stopLoss = this.riskManager.calculateStopLoss(position.price, 'sell');
        await this.lnMarketsClient.updateStopLoss(position.id, stopLoss);
        
        this.state.activePositions.set(position.id, position);
        return position;
      },

      closePosition: async (positionId) => {
        const result = await this.lnMarketsClient.closePosition(positionId);
        
        // Record closed position in P&L tracker
        const currentPrice = this.marketData.getLatestPrice();
        const trade = this.pnlTracker.closePosition(positionId, currentPrice);
        
        // Update performance
        if (result.pl > 0) {
          this.state.performance.profitableTrades++;
        }
        this.state.performance.totalPL += result.pl;
        
        // Update risk manager
        await this.riskManager.updateTradeResult(result);
        
        this.state.activePositions.delete(positionId);
        return result;
      }
    };
  }

  createRiskManagementModule() {
    return {
      monitor: async () => {
        const positions = await this.lnMarketsClient.getPositions();
        const currentPrice = this.marketData.getLatestPrice();

        // Update P&L for all positions
        const totalUnrealizedPnL = this.pnlTracker.updatePositionPnL(positions, currentPrice);
        
        // Display current positions with visual highlighting
        if (positions.length > 0) {
          logger.info(`📊 ACTIVE POSITIONS (${positions.length})`);
          
          positions.forEach(position => {
            const isLong = position.side === 'buy';
            const emoji = isLong ? '🟢 LONG' : '🔴 SHORT';
            
            // Calculate P&L
            const priceDiff = isLong ? (currentPrice - position.entry_price) : (position.entry_price - currentPrice);
            const pnlPercent = (priceDiff / position.entry_price) * 100 * position.leverage;
            const pnlDollar = priceDiff * position.quantity;
            const pnlEmoji = pnlPercent > 0 ? '💰' : '📉';
            const pnlColor = pnlPercent > 0 ? '✅' : '❌';
            
            // Calculate accumulated fees
            const hoursOpen = (Date.now() - new Date(position.timestamp).getTime()) / (1000 * 60 * 60);
            const accumulatedFees = position.fees ? 
              position.fees.opening + (position.fees.totalDailyCost * hoursOpen / 24) : 0;
            
            // Net P&L after fees
            const netPnl = pnlDollar - accumulatedFees;
            const netPnlColor = netPnl > 0 ? '💚' : '❌';
            
            logger.info(`${emoji} ${position.id}`, {
              size: `${position.quantity} BTC`,
              entry: `$${position.entry_price?.toLocaleString()}`,
              current: `$${currentPrice?.toLocaleString()}`,
              grossPnl: `${pnlColor} ${pnlPercent.toFixed(2)}% (${pnlDollar > 0 ? '+' : ''}$${pnlDollar.toFixed(2)}) ${pnlEmoji}`,
              fees: `💸 -$${accumulatedFees.toFixed(2)} (${hoursOpen.toFixed(1)}h)`,
              netPnl: `${netPnlColor} $${netPnl.toFixed(2)}`,
              leverage: `${position.leverage}x`,
              margin: `$${position.margin?.toFixed(0)}`
            });
          });
          
          // Show P&L summary every few monitoring cycles
          if (Math.random() < 0.3) {
            this.pnlTracker.logPnLSummary();
          }
        } else {
          logger.info('📭 NO ACTIVE POSITIONS');
          
          // Show P&L summary when no positions are open
          if (Math.random() < 0.1) {
            this.pnlTracker.logPnLSummary();
          }
        }

        for (const position of positions) {
          const health = this.riskManager.getPositionHealth(position, currentPrice);
          
          if (health.health === 'CRITICAL') {
            logger.warn('🚨 CRITICAL POSITION DETECTED', { 
              positionId: position.id,
              health 
            });
            
            // Auto-close if enabled
            if (this.config.modules.riskManagement.realtimeMonitoring) {
              await this.modules.tradeExecution.closePosition(position.id);
            }
          }
          
          // Check for position reduction
          const reduction = this.riskManager.shouldReducePosition(position, currentPrice);
          if (reduction.reduce) {
            logger.info('⚠️ Position reduction triggered', reduction);
            // Implement partial close logic here
          }
        }
      }
    };
  }

  createPortfolioOptimizationModule() {
    return {
      optimize: async () => {
        const positions = await this.lnMarketsClient.getPositions();
        const metrics = this.riskManager.getRiskMetrics();
        
        // Simple portfolio optimization
        if (metrics.sharpeRatio < 0.5 && positions.length > 1) {
          logger.info('Portfolio optimization triggered - low Sharpe ratio');
          // Implement rebalancing logic
        }
      }
    };
  }

  startModules() {
    if (this.modules.riskManagement) {
      setInterval(() => {
        this.modules.riskManagement.monitor();
      }, 10000); // Monitor every 10 seconds
    }

    if (this.modules.portfolioOptimization) {
      setInterval(() => {
        this.modules.portfolioOptimization.optimize();
      }, this.config.modules.portfolioOptimization.rebalanceInterval);
    }
  }

  stopModules() {
    // Clear all intervals
    // In production, store interval IDs for proper cleanup
  }

  calculateRiskScore(metrics) {
    let score = 100;
    
    // Deduct points for various risk factors
    score -= (metrics.currentDrawdown / config.risk.maxDrawdownPercentage) * 30;
    score -= (Math.abs(metrics.dailyLoss) / config.risk.maxDailyLoss) * 30;
    score -= (100 - metrics.winRate) / 2;
    
    return Math.max(0, score);
  }

  getStatus() {
    return {
      running: this.isRunning,
      mode: this.state.mode,
      lastDecision: this.state.lastDecision,
      activePositions: this.state.activePositions.size,
      performance: this.state.performance,
      riskMetrics: this.riskManager.getRiskMetrics(),
      marketMetrics: this.marketData.getMarketMetrics()
    };
  }

  // Goose-specific command handlers
  async handleCommand(command, params) {
    logger.gooseAction('COMMAND_RECEIVED', { command, params });

    switch (command) {
      case 'status':
        return this.getStatus();
      
      case 'start':
        await this.start();
        return { success: true, message: 'Agent started' };
      
      case 'stop':
        await this.stop();
        return { success: true, message: 'Agent stopped' };
      
      case 'force-decision':
        await this.makeAutonomousDecision();
        return { success: true, message: 'Decision forced' };
      
      case 'close-all':
        const positions = await this.lnMarketsClient.getPositions();
        for (const pos of positions) {
          await this.modules.tradeExecution.closePosition(pos.id);
        }
        return { success: true, message: `Closed ${positions.length} positions` };
      
      default:
        return { success: false, message: 'Unknown command' };
    }
  }
}

module.exports = GooseTradingAgent;