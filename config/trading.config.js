module.exports = {
  // Trading Parameters
  trading: {
    maxPositionSize: parseInt(process.env.MAX_POSITION_SIZE) || 100,
    maxLeverage: parseInt(process.env.MAX_LEVERAGE) || 2,
    stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE) || 2,
    profitTargetPercentage: parseFloat(process.env.PROFIT_TARGET_PERCENTAGE) || 3,
    positionLimit: parseInt(process.env.POSITION_LIMIT) || 3,
    minOrderSize: 1,
    orderTypes: ['market', 'limit'],
    timeInForce: ['gtc', 'ioc', 'fok']
  },

  // Strategy-specific configurations
  strategies: {
    conservative: {
      stopLossPercentage: 2.0,
      profitTargetPercentage: 3.0,
      maxPositionSize: 8, // USD
      maxLeverage: 1.5,
      decisionInterval: 60000, // 60 seconds
      indicators: ['sma', 'rsi', 'bollinger']
    },
    enhanced: {
      stopLossPercentage: { min: 1.5, max: 3.0 }, // Dynamic
      profitTargetPercentage: { min: 4.0, max: 6.0 }, // Dynamic
      maxPositionSize: { min: 5, max: 15 }, // USD, dynamic
      maxLeverage: 2.0,
      decisionInterval: 30000, // 30 seconds
      indicators: ['macd', 'rsi_divergence', 'stochRSI', 'ema_crossover']
    },
    adaptive: {
      // Placeholder for future ML-optimized strategy
      stopLossPercentage: 'dynamic_ml',
      profitTargetPercentage: 'dynamic_ml',
      maxPositionSize: 'dynamic_ml',
      maxLeverage: 'dynamic_ml',
      decisionInterval: 'adaptive',
      indicators: ['ml_pattern_recognition', 'adaptive_signals']
    }
  },

  // Strategy Parameters
  strategy: {
    sma: {
      shortPeriod: parseInt(process.env.SMA_SHORT_PERIOD) || 10,
      longPeriod: parseInt(process.env.SMA_LONG_PERIOD) || 30
    },
    rsi: {
      period: parseInt(process.env.RSI_PERIOD) || 14,
      oversold: parseInt(process.env.RSI_OVERSOLD) || 30,
      overbought: parseInt(process.env.RSI_OVERBOUGHT) || 70
    },
    volumeThreshold: 1000000,
    trendStrength: 0.7
  },

  // Risk Management
  risk: {
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS) || 50,
    maxDrawdownPercentage: parseFloat(process.env.MAX_DRAWDOWN_PERCENTAGE) || 10,
    riskPerTrade: parseFloat(process.env.RISK_PER_TRADE) || 2,
    portfolioHeatLimit: 6,
    correlationThreshold: 0.7
  },

  // Goose Agent Configuration
  goose: {
    mode: process.env.GOOSE_MODE || 'autonomous',
    decisionInterval: parseInt(process.env.GOOSE_DECISION_INTERVAL) || 30000, // 30 seconds for hypertrading
    hypertrading: {
      enabled: true,
      quickDecisions: true,
      dopamineNotifications: true,
      microPositions: true
    },
    modules: {
      marketAnalysis: {
        enabled: true,
        interval: 15000 // Faster market analysis for hypertrading
      },
      tradeExecution: {
        enabled: true,
        confirmationRequired: false,
        fastExecution: true
      },
      riskManagement: {
        enabled: true,
        realtimeMonitoring: true,
        microPositionOptimized: true
      },
      portfolioOptimization: {
        enabled: true,
        rebalanceInterval: 1800000 // 30 minutes instead of 1 hour
      }
    }
  },

  // Market Data Configuration
  marketData: {
    websocket: {
      reconnectInterval: parseInt(process.env.WS_RECONNECT_INTERVAL) || 5000,
      maxReconnectAttempts: parseInt(process.env.WS_MAX_RECONNECT_ATTEMPTS) || 10,
      pingInterval: 30000
    },
    priceUpdateThreshold: 0.1,
    orderBookDepth: 10
  },

  // Monitoring Configuration
  monitoring: {
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    metricsPort: parseInt(process.env.METRICS_PORT) || 3000,
    logLevel: process.env.GOOSE_LOG_LEVEL || 'info',
    logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 7
  }
};