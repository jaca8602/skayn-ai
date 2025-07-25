// Load environment-specific config
const envFile = process.env.NODE_ENV === 'mainnet' ? '.env.mainnet' : '.env';
require('dotenv').config({ path: envFile });
const logger = require('./src/utils/logger');
const LNMarketsClient = require('./src/core/lnmarkets');
const MarketDataManager = require('./src/core/market-data');
const MovingAverageStrategy = require('./src/strategies/moving-average-strategy');
const RiskManager = require('./src/risk/risk-manager');
const SkaynTradingAgent = require('./src/skayn/trading-agent');
const config = require('./config/trading.config');

// Global agent instance
let agent = null;

async function initializeAgent() {
  try {
    logger.info('=== GOOSE TRADING AGENT STARTING ===');
    logger.info('Environment:', process.env.LN_MARKETS_NETWORK || 'testnet');

    // Initialize LN Markets client
    const lnMarketsConfig = {
      key: process.env.LN_MARKETS_KEY,
      secret: process.env.LN_MARKETS_SECRET,
      passphrase: process.env.LN_MARKETS_PASSPHRASE,
      network: process.env.LN_MARKETS_NETWORK || 'testnet',
      maxReconnectAttempts: config.marketData.websocket.maxReconnectAttempts,
      reconnectInterval: config.marketData.websocket.reconnectInterval
    };

    if (!lnMarketsConfig.key || !lnMarketsConfig.secret || !lnMarketsConfig.passphrase) {
      throw new Error('Missing LN Markets API credentials. Please check your .env file.');
    }

    const lnMarketsClient = new LNMarketsClient(lnMarketsConfig);
    await lnMarketsClient.initialize();

    // Initialize market data manager
    const marketDataManager = new MarketDataManager(lnMarketsClient);
    marketDataManager.initialize();

    // Initialize risk manager
    const riskManager = new RiskManager(lnMarketsClient);

    // Initialize strategy
    const strategy = new MovingAverageStrategy(marketDataManager, riskManager);

    // Create Skayn.ai trading agent
    agent = new SkaynTradingAgent({
      lnMarketsClient,
      marketDataManager,
      strategy,
      riskManager
    });

    await agent.initialize();

    // Set up graceful shutdown
    setupGracefulShutdown();

    logger.info('=== AGENT INITIALIZED SUCCESSFULLY ===');
    logger.info('Balance:', lnMarketsClient.balance);
    logger.info('Mode:', config.goose.mode);

    return agent;
  } catch (error) {
    logger.error('Failed to initialize agent', error);
    throw error;
  }
}

function setupGracefulShutdown() {
  let shutdownInProgress = false;
  
  const shutdown = async (signal) => {
    if (shutdownInProgress) return;
    shutdownInProgress = true;
    
    console.log('\n'); // New line for cleaner output
    logger.info(`🛑 ${signal} received, shutting down gracefully...`);
    
    try {
      if (agent && agent.isRunning) {
        logger.info('⏹️ Stopping trading agent...');
        await agent.stop();
      }
      
      logger.info('✅ Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', error);
      // Force exit after error
      setTimeout(() => {
        logger.warn('⚠️ Force exiting...');
        process.exit(1);
      }, 1000);
    }
  };

  // Handle Ctrl+C
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle termination signal
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    shutdown('UNCAUGHT_EXCEPTION');
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    // Don't exit on unhandled rejections, just log them
  });
}

// Main entry point for Goose execution
async function main() {
  try {
    const tradingAgent = await initializeAgent();

    // Check for command line arguments
    const command = process.argv[2];
    const params = process.argv.slice(3);

    if (command) {
      // Execute specific command
      const result = await tradingAgent.handleCommand(command, params);
      console.log(JSON.stringify(result, null, 2));
      
      // Exit after command execution unless it's 'start'
      if (command !== 'start') {
        process.exit(0);
      }
    } else {
      // Default: start in autonomous mode
      await tradingAgent.start();
      logger.info('Agent running in autonomous mode. Press Ctrl+C to stop.');
    }

  } catch (error) {
    logger.error('Fatal error', error);
    process.exit(1);
  }
}

// Export for Goose integration
module.exports = {
  initializeAgent,
  main,
  SkaynTradingAgent,
  config
};

// Run if called directly
if (require.main === module) {
  main();
}