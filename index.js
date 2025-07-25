require('dotenv').config();
const logger = require('./src/utils/logger');
const LNMarketsClient = require('./src/core/lnmarkets');
const MarketDataManager = require('./src/core/market-data');
const MovingAverageStrategy = require('./src/strategies/moving-average-strategy');
const RiskManager = require('./src/risk/risk-manager');
const GooseTradingAgent = require('./src/goose/trading-agent');
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

    // Create Goose agent
    agent = new GooseTradingAgent({
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
  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    
    try {
      if (agent) {
        await agent.stop();
      }
      
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
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
  GooseTradingAgent,
  config
};

// Run if called directly
if (require.main === module) {
  main();
}