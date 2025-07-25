#!/usr/bin/env node

/**
 * Goose Platform Entry Point
 * This file provides the interface for Goose to interact with the trading agent
 */

const { initializeAgent } = require('./index');
const logger = require('./src/utils/logger');

// Goose command handlers
const commands = {
  start: async () => {
    const agent = await initializeAgent();
    await agent.start();
    return { status: 'started', mode: agent.config.mode };
  },

  stop: async () => {
    const agent = await initializeAgent();
    await agent.stop();
    return { status: 'stopped' };
  },

  status: async () => {
    const agent = await initializeAgent();
    return agent.getStatus();
  },

  trade: async (params) => {
    const agent = await initializeAgent();
    await agent.makeAutonomousDecision();
    return { status: 'decision_made', lastDecision: agent.state.lastDecision };
  },

  analyze: async () => {
    const agent = await initializeAgent();
    const marketMetrics = agent.marketData.getMarketMetrics();
    const signal = agent.strategy.analyze();
    return { marketMetrics, signal };
  },

  positions: async () => {
    const agent = await initializeAgent();
    const positions = await agent.lnMarketsClient.getPositions();
    return { positions, count: positions.length };
  },

  closeAll: async () => {
    const agent = await initializeAgent();
    return await agent.handleCommand('close-all');
  },

  metrics: async () => {
    const agent = await initializeAgent();
    const riskMetrics = agent.riskManager.getRiskMetrics();
    const performance = agent.state.performance;
    return { riskMetrics, performance };
  }
};

// Parse Goose input
async function handleGooseCommand(input) {
  try {
    const [command, ...args] = input.trim().split(' ');
    
    if (!commands[command]) {
      return {
        error: 'Unknown command',
        availableCommands: Object.keys(commands),
        usage: 'goose-entry.js <command> [args...]'
      };
    }

    logger.gooseAction('GOOSE_COMMAND', { command, args });
    const result = await commands[command](args);
    
    return {
      success: true,
      command,
      result,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Goose command error', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

// Main execution
async function main() {
  const input = process.argv.slice(2).join(' ');
  
  if (!input) {
    console.log(JSON.stringify({
      name: 'Goose Trading Agent',
      version: '1.0.0',
      description: 'Autonomous Bitcoin trading agent for LN Markets',
      commands: Object.keys(commands),
      usage: 'goose-entry.js <command> [args...]'
    }, null, 2));
    return;
  }

  const result = await handleGooseCommand(input);
  console.log(JSON.stringify(result, null, 2));
  
  // Keep process alive for start command
  if (input.startsWith('start')) {
    logger.info('Agent started via Goose. Process will continue running...');
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({ error: error.message }, null, 2));
    process.exit(1);
  });
}

module.exports = { handleGooseCommand };