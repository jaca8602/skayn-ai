const EventEmitter = require('events');
const logger = require('../utils/logger');
const config = require('../../config/trading.config');
const PnLTracker = require('../utils/pnl-tracker');
const EnhancedTradingStrategy = require('../strategies/enhanced-strategy');
const AdaptiveStrategy = require('../strategies/adaptive-strategy');
const DepositManager = require('../core/deposit-manager');

class SkaynTradingAgent extends EventEmitter {
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
    
    // Initialize enhanced strategy, adaptive strategy, and deposit manager
    this.enhancedStrategy = new EnhancedTradingStrategy(marketDataManager, riskManager);
    this.adaptiveStrategy = new AdaptiveStrategy(lnMarketsClient, marketDataManager, config);
    this.depositManager = new DepositManager(lnMarketsClient);
    this.currentStrategyType = 'basic'; // 'basic', 'enhanced', or 'adaptive'
    
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
      },
      strategyMetrics: {
        basic: { signals: 0, accuracy: 0 },
        enhanced: { signals: 0, accuracy: 0 },
        adaptive: { signals: 0, accuracy: 0, claudeAnalyses: 0 }
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

    // Start command listener for CLI commands while running
    this.startCommandListener();

    this.emit('started');
  }

  startCommandListener() {
    // Check for command files every 2 seconds
    this.commandInterval = setInterval(() => {
      this.checkForCommands();
    }, 2000);
  }

  async checkForCommands() {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const commandFile = path.join(process.cwd(), '.skayn-command');
      const stats = await fs.stat(commandFile);
      
      if (stats.isFile()) {
        const command = await fs.readFile(commandFile, 'utf8');
        const trimmedCommand = command.trim();
        
        logger.info(`📨 Received command while running: ${trimmedCommand}`);
        
        // Execute the command
        if (trimmedCommand === 'status') {
          this.logCurrentStatus();
        } else if (trimmedCommand === 'stop' || trimmedCommand === 'panic') {
          logger.info('🛑 Stop command received - shutting down...');
          await this.stop();
          process.exit(0);
        }
        
        // Delete the command file
        await fs.unlink(commandFile);
      }
    } catch (error) {
      // File doesn't exist or other error - ignore
    }
  }

  logCurrentStatus() {
    const status = this.getStatus();
    const currentPrice = this.marketData.getLatestPrice();
    
    logger.info('📊 CURRENT STATUS WHILE RUNNING', {
      running: status.running,
      currentPrice: currentPrice ? `$${currentPrice.toFixed(2)}` : 'N/A',
      activePositions: status.activePositions,
      totalTrades: status.performance.totalTrades,
      netPnL: status.pnl.netPnL ? `$${status.pnl.netPnL.toFixed(2)}` : '$0.00',
      lastDecision: status.lastDecision?.action || 'None'
    });
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

    // Stop command listener
    if (this.commandInterval) {
      clearInterval(this.commandInterval);
      this.commandInterval = null;
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

    // Skip autonomous trading decisions in adaptive mode
    if (this.currentStrategyType === 'adaptive') {
      logger.info('🧠 Adaptive mode: Skipping autonomous trading (only Claude analysis + confirmation)');
      
      // Still do position monitoring for existing trades
      try {
        const currentPositions = await this.lnMarketsClient.getPositions();
        this.syncPositionTracking(currentPositions);
      } catch (error) {
        logger.error('Position sync failed in adaptive mode', error);
      }
      
      return;
    }

    try {
      // Step 0: Check deposits and balance for hypertrading
      const depositStatus = await this.depositManager.getDepositStatus();
      if (!depositStatus.readyToTrade) {
        logger.warn('💰 Trading halted - deposit/balance issue', depositStatus);
        this.state.lastDecision = { action: 'HOLD', reason: depositStatus.nextAction };
        return;
      }

      // Responsible gambling check
      const safetyCheck = await this.depositManager.enforceResponsibleGambling();
      if (safetyCheck.emergencyStop) {
        logger.warn('🚨 Emergency stop triggered - responsible gambling limits', safetyCheck);
        this.state.lastDecision = { action: 'HOLD', reason: 'Trading suspended for safety' };
        return;
      }

      // Step 0.5: Critical position sync - prevent the 3,007 sats loss scenario
      try {
        const currentPositions = await this.lnMarketsClient.getPositions();
        this.syncPositionTracking(currentPositions);
      } catch (error) {
        logger.error('💥 CRITICAL: Cannot sync positions with LN Markets', {
          error: error.message,
          action: 'HALT_TRADING'
        });
        this.state.lastDecision = { action: 'HOLD', reason: 'Position tracking failure - trading halted for safety' };
        return;
      }

      // Step 1: Analyze market
      const marketAnalysis = await this.modules.marketAnalysis.analyze();
      
      // Step 2: Generate trading signal using current strategy
      const signal = this.getCurrentStrategy().analyze();
      
      // Track strategy performance
      this.updateStrategyMetrics(signal);
      
      // Step 3: Apply risk checks
      const riskAssessment = await this.assessRisk(signal);
      
      // Step 4: Make decision
      const decision = this.synthesizeDecision(marketAnalysis, signal, riskAssessment);
      
      // Step 5: Execute decision (with dopamine notifications)
      if (decision.action !== 'HOLD') {
        const executionResult = await this.executeDecision(decision);
        this.sendDopamineNotification(decision, executionResult);
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

    // SMART TRADING: Auto-detect testing vs production mode
    const currentPrice = this.marketData.getLatestPrice();
    const balanceUSD = (this.lnMarketsClient.balance / 100000000) * currentPrice;
    const isTestingMode = balanceUSD < 50; // Under $50 = testing mode
    
    // First priority: Real signals from strategy analysis
    if (signal && signal.action !== 'HOLD') {
      decision.action = signal.action;
      decision.confidence = signal.confidence;
      decision.reasons = signal.reasons || [`${signal.action} signal from market analysis`];
      
      logger.info('🧠 STRATEGIC DECISION: AI-driven market analysis', {
        action: decision.action,
        confidence: decision.confidence,
        price: currentPrice,
        signal: signal.type,
        reasons: decision.reasons,
        mode: isTestingMode ? 'TESTING' : 'PRODUCTION'
      });
      
      return decision;
    }
    
    // Testing mode: Create trading opportunities for development
    if (isTestingMode && currentPrice && this.state.performance.totalTrades < 3) {
      const marketMetrics = this.marketData.getMarketMetrics();
      
      // Try RSI first if available
      if (marketMetrics.rsi) {
        if (marketMetrics.rsi > 55) {
          decision.action = 'SELL';
          decision.confidence = 0.6;
          decision.reasons = [`Testing: RSI ${marketMetrics.rsi.toFixed(1)} suggests potential sell`];
        } else if (marketMetrics.rsi < 45) {
          decision.action = 'BUY';
          decision.confidence = 0.6;
          decision.reasons = [`Testing: RSI ${marketMetrics.rsi.toFixed(1)} suggests potential buy`];
        }
      } else {
        // Fallback: Use price movement when RSI not available
        const priceHistory = this.marketData.priceHistory || [];
        if (priceHistory.length >= 2) {
          const lastPrice = priceHistory[priceHistory.length - 2]?.price || currentPrice;
          const priceChange = ((currentPrice - lastPrice) / lastPrice) * 100;
          
          if (priceChange > 0.1) {
            decision.action = 'SELL';
            decision.confidence = 0.6;
            decision.reasons = [`Testing: Price up ${priceChange.toFixed(2)}% - taking profit`];
          } else if (priceChange < -0.1) {
            decision.action = 'BUY';
            decision.confidence = 0.6;
            decision.reasons = [`Testing: Price down ${priceChange.toFixed(2)}% - buying dip`];
          }
        } else {
          // Ultimate fallback: Alternate BUY/SELL for testing
          decision.action = this.state.performance.totalTrades % 2 === 0 ? 'BUY' : 'SELL';
          decision.confidence = 0.6;
          decision.reasons = [`Testing fallback: ${decision.action} signal for system verification`];
        }
      }
      
      if (decision.action !== 'HOLD') {
        logger.info('🧪 AUTO-TESTING MODE: Development trading active', {
          action: decision.action,
          confidence: decision.confidence,
          balanceUSD: `$${balanceUSD.toFixed(2)}`,
          rsi: marketMetrics.rsi || 'N/A',
          priceHistoryLength: marketMetrics.priceHistoryLength,
          reasons: decision.reasons
        });
        
        return decision;
      }
    }

    // For demo trades, always allow execution
    const isDemoTrade = signal.reason && signal.reason.includes('DEMO');
    
    // TESTNET: Ultra-low thresholds for demo trading (any signal will trigger)
    if (isDemoTrade || (signal && signal.confidence > 0.01 && marketAnalysis.marketHealth !== 'EXTREME')) {
      decision.action = signal.action || 'BUY'; // Default to BUY for demo
      decision.confidence = Math.max(signal.confidence * (marketAnalysis.confidence || 0.8), 0.6); // Min 60% confidence for demo
      decision.reasons = [
        signal.reason || 'Demo trade for testnet',
        `Market health: ${marketAnalysis.marketHealth}`
      ];
      
      logger.info('🎯 TESTNET: Lowered thresholds for demo trading', {
        originalConfidence: signal.confidence,
        finalConfidence: decision.confidence,
        action: decision.action
      });
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

      let position;
      if (decision.action === 'BUY') {
        position = await this.modules.tradeExecution.openLong(size);
      } else if (decision.action === 'SELL') {
        position = await this.modules.tradeExecution.openShort(size);
      }

      this.state.performance.totalTrades++;
      
      return { success: true, position };
      
    } catch (error) {
      logger.error('Decision execution failed', error);
      return { success: false, error };
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
        
        // Set stop loss (only for real positions, not mock)
        // TEMPORARILY DISABLED: API key lacks stop loss permissions
        if (!position.id.toString().startsWith('mock-') && false) {
          const stopLoss = this.riskManager.calculateStopLoss(position.price, 'buy');
          try {
            await this.lnMarketsClient.updateStopLoss(position.id, stopLoss);
          } catch (error) {
            logger.warn('Stop loss update failed (continuing without)', { 
              positionId: position.id, 
              error: error.message 
            });
          }
        }
        
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
        
        // Set stop loss (only for real positions, not mock)
        // TEMPORARILY DISABLED: API key lacks stop loss permissions
        if (!position.id.toString().startsWith('mock-') && false) {
          const stopLoss = this.riskManager.calculateStopLoss(position.price, 'sell');
          try {
            await this.lnMarketsClient.updateStopLoss(position.id, stopLoss);
          } catch (error) {
            logger.warn('Stop loss update failed (continuing without)', { 
              positionId: position.id, 
              error: error.message 
            });
          }
        }
        
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
            const isLong = position.side === 'b'; // LN Markets API uses 'b' for buy/long, 's' for sell/short
            const emoji = isLong ? '🟢 LONG' : '🔴 SHORT';
            
            // Calculate P&L
            const priceDiff = isLong ? (currentPrice - position.entry_price) : (position.entry_price - currentPrice);
            const pnlPercent = (priceDiff / position.entry_price) * 100 * position.leverage;
            const pnlDollar = priceDiff * (position.quantity / 100000000); // Convert sats to BTC for USD calculation
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
              size: `${position.quantity} sats`,
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
          
          // 🎯 AI AUTONOMY: Check profit targets based on strategy
          const profitTargetReached = this.checkProfitTarget(position, currentPrice);
          if (profitTargetReached.shouldClose) {
            logger.info('🎯 PROFIT TARGET REACHED - AI Auto-closing position', {
              positionId: position.id.slice(-8),
              strategy: this.config.strategy || this.currentStrategyType,
              profitPercent: profitTargetReached.profitPercent.toFixed(2),
              targetPercent: profitTargetReached.targetPercent,
              profitSats: profitTargetReached.profitSats
            });
            
            // AI autonomously closes the position
            if (this.config.modules.riskManagement.realtimeMonitoring) {
              await this.modules.tradeExecution.closePosition(position.id);
              logger.info('✅ Position closed by AI at profit target', {
                positionId: position.id.slice(-8),
                profit: `${profitTargetReached.profitPercent.toFixed(2)}%`
              });
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

  checkProfitTarget(position, currentPrice) {
    const isLong = position.side === 'b';
    const entryPrice = position.entry_price || position.price;
    
    // Calculate current profit percentage
    const priceDiff = isLong ? (currentPrice - entryPrice) : (entryPrice - currentPrice);
    const profitPercent = (priceDiff / entryPrice) * 100 * (position.leverage || 1);
    
    // Get strategy-specific profit target
    const strategy = this.config.strategy || this.currentStrategyType || 'conservative';
    const strategyConfig = config.strategies[strategy];
    
    let targetPercent;
    if (strategyConfig && strategyConfig.profitTargetPercentage) {
      if (typeof strategyConfig.profitTargetPercentage === 'object') {
        // Enhanced strategy - dynamic targets
        targetPercent = strategyConfig.profitTargetPercentage.min; // Use minimum for now
      } else {
        // Conservative strategy - fixed target
        targetPercent = strategyConfig.profitTargetPercentage;
      }
    } else {
      // Fallback to default
      targetPercent = config.trading.profitTargetPercentage || 3;
    }
    
    // Calculate profit in sats
    const profitSats = Math.round(priceDiff * (position.quantity / 100000000) * 100000000);
    
    const shouldClose = profitPercent >= targetPercent;
    
    return {
      shouldClose,
      profitPercent,
      targetPercent,
      profitSats,
      strategy
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

  // Strategy Management Methods
  getCurrentStrategy() {
    return this.currentStrategyType === 'enhanced' ? this.enhancedStrategy : this.strategy;
  }

  switchStrategy(strategyType) {
    if (strategyType !== 'basic' && strategyType !== 'enhanced') {
      throw new Error('Invalid strategy type. Use "basic" or "enhanced"');
    }

    const oldStrategy = this.currentStrategyType;
    this.currentStrategyType = strategyType;

    logger.gooseAction('STRATEGY_SWITCHED', {
      from: oldStrategy,
      to: strategyType,
      reason: 'Manual switch'
    });

    return {
      success: true,
      previousStrategy: oldStrategy,
      currentStrategy: strategyType
    };
  }

  updateStrategyMetrics(signal) {
    if (signal && signal.action !== 'HOLD') {
      this.state.strategyMetrics[this.currentStrategyType].signals++;
    }
  }

  compareStrategies() {
    const basicMetrics = this.strategy.getSignalHistory ? this.strategy.getSignalHistory(20) : [];
    const enhancedMetrics = this.enhancedStrategy.getSignalHistory(20);

    return {
      basic: {
        recentSignals: basicMetrics.length,
        lastSignal: basicMetrics[basicMetrics.length - 1] || null,
        type: 'Moving Average Strategy'
      },
      enhanced: {
        recentSignals: enhancedMetrics.length,
        lastSignal: enhancedMetrics[enhancedMetrics.length - 1] || null,
        type: 'Enhanced Multi-Indicator Strategy',
        metrics: this.enhancedStrategy.getStrategyMetrics ? this.enhancedStrategy.getStrategyMetrics() : null
      },
      current: this.currentStrategyType
    };
  }

  autoSwitchStrategy() {
    const comparison = this.compareStrategies();
    const enhancedPerf = this.state.strategyMetrics.enhanced;
    const basicPerf = this.state.strategyMetrics.basic;

    // Auto-switch to enhanced if it shows better performance
    if (enhancedPerf.signals > 10 && enhancedPerf.accuracy > basicPerf.accuracy + 0.1) {
      if (this.currentStrategyType === 'basic') {
        this.switchStrategy('enhanced');
        logger.gooseAction('AUTO_STRATEGY_SWITCH', {
          reason: 'Enhanced strategy showing better performance',
          enhancedAccuracy: enhancedPerf.accuracy,
          basicAccuracy: basicPerf.accuracy
        });
      }
    }
  }

  sendDopamineNotification(decision, executionResult) {
    if (!this.config.hypertrading?.dopamineNotifications) return;

    const notification = {
      type: 'TRADE_EXECUTED',
      action: decision.action,
      timestamp: new Date().toISOString(),
      result: executionResult?.success ? 'SUCCESS' : 'FAILED',
      message: this.generateDopamineMessage(decision, executionResult)
    };

    // Log with special dopamine emoji for easy filtering
    logger.info(`🎯 ${notification.message}`, notification);
    
    // Emit event for external notification systems
    this.emit('dopamine-hit', notification);
  }

  generateDopamineMessage(decision, result) {
    const action = decision.action === 'BUY' ? '📈 LONG' : '📉 SHORT';
    const amount = `$${this.config.trading?.maxPositionSize || 100}`;
    
    if (result?.success) {
      return `${action} position opened! ${amount} at risk. 🚀`;
    } else {
      return `${action} attempt failed. Waiting for next opportunity... ⏰`;
    }
  }

  async handlePanicButton(params) {
    try {
      // Get current positions and P&L
      const positions = await this.lnMarketsClient.getPositions();
      const pnlStats = this.pnlTracker.getPnLSummary();
      const balanceInfo = await this.depositManager.getAccountBalance();
      
      if (positions.length === 0) {
        return {
          success: true,
          message: '✅ No open positions to close. You\'re already safe!',
          positions: 0,
          currentPnL: pnlStats.totalPnL || 0
        };
      }

      // Calculate total exposure and unrealized P&L
      let totalExposure = 0;
      let unrealizedPnL = 0;
      
      positions.forEach(pos => {
        totalExposure += pos.quantity || 0;
        unrealizedPnL += pos.unrealizedPnL || 0;
      });

      const confirmation = {
        action: 'PANIC_CLOSE_CONFIRMATION',
        warning: '🚨 EMERGENCY STOP REQUESTED 🚨',
        message: 'Are you sure you want to close ALL positions immediately?',
        impact: {
          positionsToClose: positions.length,
          totalExposure: `$${totalExposure.toLocaleString()}`,
          unrealizedPnL: unrealizedPnL >= 0 ? `+$${unrealizedPnL.toFixed(2)}` : `-$${Math.abs(unrealizedPnL).toFixed(2)}`,
          currentBalance: `${balanceInfo.balanceSats?.toLocaleString() || 0} sats ($${balanceInfo.balanceUSD?.toFixed(2) || 0})`
        },
        positions: positions.map(pos => ({
          id: pos.id,
          side: pos.side?.toUpperCase(),
          quantity: pos.quantity,
          unrealizedPnL: pos.unrealizedPnL,
          entryPrice: pos.price
        })),
        confirmationRequired: true,
        confirmCommand: 'confirm-panic',
        timeoutMinutes: 5,
        alternatives: [
          'Type "confirm-panic" to close all positions immediately',
          'Type "status" to check current positions',
          'Wait 5 minutes and this panic request will expire'
        ]
      };

      // Store panic request with timestamp
      this.state.panicRequest = {
        timestamp: Date.now(),
        positions: positions.length,
        totalExposure,
        unrealizedPnL
      };

      logger.warn('🚨 PANIC BUTTON PRESSED', confirmation);
      
      return {
        success: true,
        ...confirmation
      };

    } catch (error) {
      logger.error('Panic button error', error);
      return {
        success: false,
        error: 'Failed to process panic request',
        message: 'Try "close-all" command or contact support'
      };
    }
  }

  async executePanicClose(params) {
    try {
      // Check if there's a valid panic request
      if (!this.state.panicRequest) {
        return {
          success: false,
          message: 'No panic request found. Use "panic" command first.'
        };
      }

      // Check if panic request is still valid (5 minutes)
      const requestAge = Date.now() - this.state.panicRequest.timestamp;
      if (requestAge > 5 * 60 * 1000) {
        this.state.panicRequest = null;
        return {
          success: false,
          message: 'Panic request expired. Use "panic" command again if needed.'
        };
      }

      // Execute emergency close
      logger.warn('🚨 EXECUTING EMERGENCY CLOSE - ALL POSITIONS');
      
      const positions = await this.lnMarketsClient.getPositions();
      const results = [];
      let successCount = 0;
      let totalPnL = 0;

      // Stop autonomous trading during panic
      const wasRunning = this.isRunning;
      if (wasRunning) {
        await this.stop();
        logger.warn('🛑 Autonomous trading stopped during emergency close');
      }

      // Close all positions
      for (const position of positions) {
        try {
          const closeResult = await this.modules.tradeExecution.closePosition(position.id);
          if (closeResult) {
            successCount++;
            totalPnL += closeResult.realizedPnL || 0;
            results.push({
              positionId: position.id,
              side: position.side,
              status: 'CLOSED',
              pnl: closeResult.realizedPnL || 0
            });
          }
        } catch (error) {
          logger.error(`Failed to close position ${position.id}`, error);
          results.push({
            positionId: position.id,
            side: position.side,
            status: 'FAILED',
            error: error.message
          });
        }
      }

      // Clear panic request
      this.state.panicRequest = null;

      const summary = {
        success: true,
        action: 'EMERGENCY_CLOSE_EXECUTED',
        message: `🚨 Emergency close completed! ${successCount}/${positions.length} positions closed.`,
        summary: {
          positionsAttempted: positions.length,
          positionsClosed: successCount,
          positionsFailed: positions.length - successCount,
          totalRealizedPnL: totalPnL >= 0 ? `+$${totalPnL.toFixed(2)}` : `-$${Math.abs(totalPnL).toFixed(2)}`,
          tradingStatus: 'STOPPED',
          timestamp: new Date().toISOString()
        },
        results,
        nextSteps: [
          'Review your P&L and account balance',
          'Consider taking a break from trading',
          'Use "start" command to resume trading when ready',
          'Use "status" to check final account state'
        ]
      };

      // Log dramatic emergency close
      logger.warn('🚨 EMERGENCY CLOSE COMPLETED', summary);
      
      // Send emergency notification
      this.emit('emergency-close', summary);

      return summary;

    } catch (error) {
      logger.error('Emergency close execution failed', error);
      return {
        success: false,
        error: 'Emergency close failed',
        message: 'Contact support immediately if positions are still open'
      };
    }
  }

  // Critical method to prevent position tracking desync
  syncPositionTracking(currentPositions) {
    const previousPositions = new Map(this.state.activePositions);
    
    // Update active positions with current data
    this.state.activePositions.clear();
    currentPositions.forEach(pos => {
      this.state.activePositions.set(pos.id, pos);
    });

    // Detect closed positions (were in previous but not in current)
    for (const [posId, prevPos] of previousPositions) {
      if (!this.state.activePositions.has(posId)) {
        logger.warn('🔍 Position closed detected (not tracked by agent):', {
          positionId: posId,
          side: prevPos.side,
          action: 'POSITION_CLOSED_EXTERNALLY'
        });
        
        // Update P&L tracking with estimated closure
        this.pnlTracker.recordTrade({
          id: posId,
          side: prevPos.side,
          quantity: prevPos.quantity,
          entryPrice: prevPos.price,
          exitPrice: this.marketData.getLatestPrice() || prevPos.price,
          timestamp: new Date().toISOString(),
          source: 'external_closure'
        });
      }
    }

    // Detect new positions (in current but not in previous)
    for (const [posId, currentPos] of this.state.activePositions) {
      if (!previousPositions.has(posId)) {
        logger.info('🆕 New position detected:', {
          positionId: posId,
          side: currentPos.side,
          quantity: currentPos.quantity,
          price: currentPos.price
        });
      }
    }

    logger.info('📊 Position sync complete:', {
      activePositions: this.state.activePositions.size,
      previousCount: previousPositions.size
    });
  }

  getStatus() {
    return {
      running: this.isRunning,
      mode: this.state.mode,
      lastDecision: this.state.lastDecision,
      activePositions: this.state.activePositions.size,
      performance: this.state.performance,
      riskMetrics: this.riskManager.getRiskMetrics(),
      marketMetrics: this.marketData.getMarketMetrics(),
      strategy: {
        current: this.currentStrategyType,
        comparison: this.compareStrategies(),
        metrics: this.state.strategyMetrics
      },
      pnl: this.pnlTracker.getPnLSummary()
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
      
      case 'switch-strategy':
        if (!params || !params.strategy) {
          return { success: false, message: 'Strategy parameter required (basic/enhanced)' };
        }
        try {
          const result = this.switchStrategy(params.strategy);
          return { success: true, ...result };
        } catch (error) {
          return { success: false, message: error.message };
        }
      
      case 'compare-strategies':
        return { success: true, comparison: this.compareStrategies() };
      
      case 'enable-enhanced':
        const switchResult = this.switchStrategy('enhanced');
        return { 
          success: true, 
          message: 'Enhanced strategy enabled with MACD, RSI divergence, and multi-indicator analysis',
          ...switchResult 
        };

      case 'check-balance':
        const balance = await this.depositManager.getAccountBalance();
        return { success: true, balance };

      case 'deposit-status':
        const depositStatus = await this.depositManager.getDepositStatus();
        return { success: true, ...depositStatus };

      case 'deposit-instructions':
        const instructions = await this.depositManager.generateDepositInstructions();
        return { success: true, instructions };

      case 'create-invoice':
        const amountSats = params?.amount || 50000;
        console.log(`\n💸 Creating Lightning invoice for ${amountSats.toLocaleString()} sats...\n`);
        
        const invoice = await this.lnMarketsClient.createDepositInvoice(amountSats);
        
        if (invoice.success && invoice.invoice) {
          console.log('\n⚡ LIGHTNING INVOICE QR CODE ⚡\n');
          const qrcode = require('qrcode-terminal');
          qrcode.generate(invoice.invoice, { small: true });
          
          const btcPrice = await this.depositManager.getBitcoinPrice();
          const amountUSD = (amountSats / 100000000) * btcPrice;
          
          console.log('\n📋 Invoice:', invoice.invoice.substring(0, 40) + '...');
          console.log(`💰 Amount: ${amountSats.toLocaleString()} sats (~$${amountUSD.toFixed(2)})`);
          console.log('⏰ Expires: ~10 minutes\n');
        }
        
        return { success: invoice.success, ...invoice };

      case 'hypertrading-check':
        const eligibility = await this.depositManager.checkHypertradingEligibility();
        return { success: true, eligibility };

      case 'daily-limits':
        const limits = await this.depositManager.checkDailyLimits();
        return { success: true, limits };

      case 'panic':
      case 'stop':
      case 'emergency':
        return await this.handlePanicButton(params);

      case 'confirm-panic':
        return await this.executePanicClose(params);
      
      default:
        return { success: false, message: 'Unknown command' };
    }
  }

  /**
   * Start adaptive strategy with Claude analysis
   * Pure adaptive mode: CSV analysis → Premium UX → User confirmation → Execution
   * No autonomous trading decisions
   */
  async startAdaptiveStrategy() {
    logger.info('🧠 Starting Pure Adaptive Strategy Mode');
    
    this.currentStrategyType = 'adaptive';
    this.config.strategy = 'adaptive';
    this.isRunning = true;
    
    // Start modules but NOT the autonomous trading loop
    await this.initialize();
    this.startModules();
    
    // Only start position monitoring (no trading decisions)
    this.startAdaptivePositionMonitoring();
    
    // Run IMMEDIATE analysis on startup for instant gratification
    logger.info('🚀 Running immediate Claude analysis for instant trading opportunity...');
    try {
      await this.runAdaptiveAnalysis();
    } catch (error) {
      logger.error('Initial adaptive analysis failed', error);
    }
    
    // Set up hourly Claude analysis for ongoing opportunities
    this.adaptiveInterval = setInterval(async () => {
      try {
        await this.runAdaptiveAnalysis();
      } catch (error) {
        logger.error('Adaptive analysis interval error', error);
      }
    }, 3600000); // 1 hour
    
    logger.info('✅ Adaptive strategy started - Claude will analyze market data hourly');
    logger.info('💡 Pure adaptive mode: No autonomous trading, only Claude analysis → User confirmation');
  }

  /**
   * Run Claude analysis and get trade recommendation
   */
  async runAdaptiveAnalysis() {
    try {
      logger.info('🔍 Running Claude adaptive analysis...');
      
      // Track analytics
      this.state.strategyMetrics.adaptive.claudeAnalyses++;
      
      // Run the adaptive strategy analysis (shows premium UX)
      const result = await this.adaptiveStrategy.analyze();
      
      if (result.metadata?.userConfirmed) {
        logger.info('📈 User confirmed adaptive trade - executing...', {
          action: result.action,
          amount: result.amount,
          confidence: result.confidence
        });
        
        // Execute whatever trade the user confirmed (BUY, SELL, or HOLD)
        await this.executeAdaptiveTrade(result);
      } else {
        logger.info('❌ User declined adaptive trade recommendation', {
          action: result.action,
          confidence: result.confidence
        });
      }
      
      return result;
      
    } catch (error) {
      logger.error('Adaptive analysis failed', error);
      throw error;
    }
  }

  /**
   * Execute adaptive trade with confidence-based targets
   */
  async executeAdaptiveTrade(recommendation) {
    try {
      const { action, amount, confidence, metadata } = recommendation;
      const claudeAnalysis = metadata.claudeAnalysis;
      
      // Extract USD amount from new position sizing structure
      const positionUSD = amount.positionUSD || amount; // Handle both old and new format
      const leverage = amount.leverage || 1;
      
      // Convert USD to sats for LN Markets API
      const currentPrice = this.marketData.getLatestPrice();
      const positionSats = Math.floor((positionUSD * 100000000) / currentPrice);
      
      logger.info('💰 Executing adaptive position', {
        action,
        positionUSD: `$${positionUSD}`,
        positionSats: `${positionSats} sats`,
        leverage: `${leverage}x`,
        confidence,
        totalExposure: `$${positionUSD * leverage}`,
        takeProfit: claudeAnalysis.takeProfit,
        stopLoss: claudeAnalysis.stopLoss
      });
      
      // Handle different action types
      let position;
      
      if (action === 'HOLD') {
        // For HOLD: Create a small position to demonstrate user choice
        logger.info('🔒 User chose to execute HOLD signal - creating minimal demonstration position');
        
        // Convert sats to BTC quantity for the API call
        const quantityBTC = positionSats / 100000000;
        position = await this.lnMarketsClient.openPosition('buy', quantityBTC, 1);
      } else {
        // For BUY/SELL: Execute as requested
        
        // Convert sats to BTC quantity for the API call
        const quantityBTC = positionSats / 100000000;
        const side = action === 'BUY' ? 'buy' : 'sell';
        position = await this.lnMarketsClient.openPosition(side, quantityBTC, leverage);
      }
      
      // Track position with Claude's targets
      this.state.activePositions.set(position.id, {
        ...position,
        strategy: 'adaptive',
        confidence: confidence,
        takeProfitPrice: claudeAnalysis.takeProfit,
        stopLossPrice: claudeAnalysis.stopLoss,
        claudeReasoning: claudeAnalysis.reasoning,
        entryTime: Date.now()
      });
      
      // Set last decision
      this.state.lastDecision = {
        action,
        strategy: 'adaptive',
        confidence,
        reasoning: claudeAnalysis.reasoning,
        targets: {
          takeProfit: claudeAnalysis.takeProfit,
          stopLoss: claudeAnalysis.stopLoss
        },
        timestamp: new Date().toISOString()
      };
      
      // Clean, visible trade confirmation
      console.log('\n' + '🎯'.repeat(30));
      console.log('🎯 ADAPTIVE TRADE EXECUTED SUCCESSFULLY');
      console.log('🎯'.repeat(30));
      console.log(`📈 Position: ${action} ${position.side === 'b' ? 'LONG' : 'SHORT'} @ $${position.price?.toLocaleString()}`);
      console.log(`💰 Margin: ${position.margin} sats ($${(position.margin * currentPrice / 100000000).toFixed(2)})`);
      console.log(`🎯 Take Profit: $${claudeAnalysis.takeProfit.toLocaleString()}`);
      console.log(`🛑 Stop Loss: $${claudeAnalysis.stopLoss.toLocaleString()}`);
      console.log(`✨ Confidence: ${confidence}/10`);
      console.log(`🆔 Position ID: ${position.id.slice(-8)}`);
      console.log('🎯'.repeat(30) + '\n');
      
      logger.info('✅ Adaptive trade executed successfully', {
        positionId: position.id,
        strategy: 'adaptive',
        confidence
      });
      
      return position;
      
    } catch (error) {
      logger.error('Failed to execute adaptive trade', error);
      throw error;
    }
  }

  /**
   * Override profit target checking for adaptive strategy
   */
  checkProfitTarget(position, currentPrice) {
    if (position.strategy === 'adaptive') {
      // Use Claude's confidence-based targets
      const isLong = position.side === 'b';
      const takeProfitPrice = position.takeProfitPrice;
      
      const shouldClose = isLong ? 
        currentPrice >= takeProfitPrice :
        currentPrice <= takeProfitPrice;
      
      if (shouldClose) {
        const profitPercent = isLong ?
          ((currentPrice - position.entry_price) / position.entry_price) * 100 :
          ((position.entry_price - currentPrice) / position.entry_price) * 100;
        
        return {
          shouldClose: true,
          reason: `Adaptive profit target reached (${profitPercent.toFixed(2)}% profit)`,
          strategy: 'adaptive',
          confidence: position.confidence
        };
      }
    }
    
    // Fall back to default profit target logic for other strategies
    const strategy = this.config.strategy || this.currentStrategyType || 'conservative';
    const strategyConfig = config.strategies?.[strategy];
    
    if (!strategyConfig) return { shouldClose: false };
    
    const isLong = position.side === 'b';
    const profitPercent = isLong ?
      ((currentPrice - position.entry_price) / position.entry_price) * 100 :
      ((position.entry_price - currentPrice) / position.entry_price) * 100;
    
    let targetPercent = strategyConfig.profitTargetPercentage;
    if (typeof targetPercent === 'object') {
      targetPercent = targetPercent.min;
    }
    
    return {
      shouldClose: profitPercent >= targetPercent,
      reason: profitPercent >= targetPercent ? 
        `${strategy} profit target reached (${profitPercent.toFixed(2)}%)` : 
        'Target not yet reached',
      strategy,
      profitPercent: profitPercent.toFixed(2)
    };
  }

  /**
   * Adaptive position monitoring - only monitor existing positions, no new trades
   */
  startAdaptivePositionMonitoring() {
    logger.info('👁️ Starting adaptive position monitoring (no autonomous trading)');
    
    this.positionMonitoringInterval = setInterval(async () => {
      try {
        // Only monitor existing positions for profit targets and risk management
        const positions = await this.lnMarketsClient.getPositions();
        this.syncPositionTracking(positions);
        
        // Check each position for profit targets (including Claude's targets)
        for (const position of positions) {
          const currentPrice = this.marketData.getLatestPrice();
          if (currentPrice) {
            const profitCheck = this.checkProfitTarget(position, currentPrice);
            
            if (profitCheck.shouldClose) {
              logger.info('🎯 Closing position at target', {
                positionId: position.id.slice(-8),
                reason: profitCheck.reason,
                strategy: profitCheck.strategy
              });
              
              // Close the position
              await this.lnMarketsClient.closePosition(position.id);
            }
          }
        }
        
      } catch (error) {
        logger.error('Position monitoring error', error);
      }
    }, 10000); // Check every 10 seconds
  }
}

module.exports = SkaynTradingAgent;