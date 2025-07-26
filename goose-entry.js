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
    // Check if they want to panic stop (close positions) or just stop the agent
    const positions = await agent.lnMarketsClient.getPositions();
    
    if (positions.length > 0) {
      // Positions open - trigger panic button
      return await agent.handleCommand('panic');
    } else {
      // No positions - just stop the agent
      await agent.stop();
      return { status: 'stopped', message: 'Agent stopped. No positions to close.' };
    }
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
    
    try {
      // Get ALL trades from LN Markets API (try different type filters)
      let allTrades = [];
      try {
        // Try getting running trades first
        allTrades = await agent.lnMarketsClient.restClient.futuresGetTrades({ type: 'running' });
      } catch (e1) {
        try {
          // Try getting open trades
          allTrades = await agent.lnMarketsClient.restClient.futuresGetTrades({ type: 'open' });
        } catch (e2) {
          // Try getting closed trades to see if our position closed
          allTrades = await agent.lnMarketsClient.restClient.futuresGetTrades({ type: 'closed' });
        }
      }
      const currentPrice = agent.marketData.getLatestPrice() || 116000;
      
      // Find our specific trade
      const ourTrade = allTrades.find(trade => trade.id === 'c6368001-d42e-427f-90b1-c47492e86a9e');
      
      if (ourTrade) {
        // Calculate P&L
        const isLong = ourTrade.side === 'b';
        const pnlSats = isLong ? 
          (currentPrice - ourTrade.entry_price) * (ourTrade.quantity / 100000000) * 100000000 :
          (ourTrade.entry_price - currentPrice) * (ourTrade.quantity / 100000000) * 100000000;
        const pnlUSD = pnlSats / 100000000 * currentPrice;
        
        return {
          success: true,
          message: `📊 POSITION STATUS`,
          position: {
            id: ourTrade.id.slice(-8),
            side: isLong ? '🟢 LONG' : '🔴 SHORT',
            status: ourTrade.running ? '✅ OPEN' : '❌ CLOSED',
            margin: `${ourTrade.margin} sats`,
            entry: `$${ourTrade.entry_price.toLocaleString()}`,
            current: `$${currentPrice.toLocaleString()}`,
            pnl: `${pnlSats > 0 ? '+' : ''}${Math.round(pnlSats)} sats (${pnlUSD > 0 ? '+' : ''}$${pnlUSD.toFixed(2)})`,
            age: `${Math.floor((Date.now() - ourTrade.creation_ts) / 60000)}min ago`
          },
          balance: `${agent.lnMarketsClient.balance} sats available`
        };
      } else {
        return {
          success: false,
          message: "❌ Position c6368001... not found in API",
          balance: `${agent.lnMarketsClient.balance} sats available`,
          totalTrades: allTrades.length,
          recentTrades: allTrades.slice(-3).map(t => `${t.id.slice(-8)}: ${t.running ? 'OPEN' : 'CLOSED'}`)
        };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error.message, 
        balance: `${agent.lnMarketsClient.balance} sats` 
      };
    }
  },

  portfolio: async () => {
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
  },

  enhancedStrategy: async () => {
    const agent = await initializeAgent();
    return await agent.handleCommand('enable-enhanced');
  },

  switchStrategy: async (params) => {
    const agent = await initializeAgent();
    const strategyType = params && params[0] ? params[0] : 'enhanced';
    return await agent.handleCommand('switch-strategy', { strategy: strategyType });
  },

  compareStrategies: async () => {
    const agent = await initializeAgent();
    return await agent.handleCommand('compare-strategies');
  },

  analyzeEnhanced: async () => {
    const agent = await initializeAgent();
    // Force switch to enhanced strategy temporarily for analysis
    const currentStrategy = agent.currentStrategyType;
    agent.currentStrategyType = 'enhanced';
    
    const marketMetrics = agent.marketData.getMarketMetrics();
    const enhancedSignal = agent.enhancedStrategy.analyze();
    
    // Switch back
    agent.currentStrategyType = currentStrategy;
    
    return { 
      marketMetrics, 
      enhancedSignal,
      strategyType: 'enhanced',
      indicators: enhancedSignal.strategy === 'enhanced' ? 'MACD, RSI Divergence, StochRSI, EMA Crossover' : 'Standard'
    };
  },

  // Deposit and Balance Commands
  checkBalance: async () => {
    const agent = await initializeAgent();
    return await agent.handleCommand('check-balance');
  },

  depositStatus: async () => {
    const agent = await initializeAgent();
    return await agent.handleCommand('deposit-status');
  },

  depositInstructions: async () => {
    const agent = await initializeAgent();
    return await agent.handleCommand('deposit-instructions');
  },

  createInvoice: async (params) => {
    const agent = await initializeAgent();
    const amountSats = params && params[0] ? parseInt(params[0]) : 50000; // Default 50k sats
    return await agent.handleCommand('create-invoice', { amount: amountSats });
  },

  hypertradingCheck: async () => {
    const agent = await initializeAgent();
    return await agent.handleCommand('hypertrading-check');
  },

  dailyLimits: async () => {
    const agent = await initializeAgent();
    return await agent.handleCommand('daily-limits');
  },

  // Emergency Commands
  panic: async () => {
    const agent = await initializeAgent();
    return await agent.handleCommand('panic');
  },

  stop: async () => {
    const agent = await initializeAgent();
    return await agent.handleCommand('panic');
  },

  emergency: async () => {
    const agent = await initializeAgent();
    return await agent.handleCommand('panic');
  },

  confirmPanic: async () => {
    const agent = await initializeAgent();
    return await agent.handleCommand('confirm-panic');
  },

  // Help and Menu System
  menu: async () => {
    return {
      success: true,
      title: "🪿 Skayn.ai - Autonomous Bitcoin Trading Agent",
      subtitle: "Lightning-powered hypertrading with Goose AI",
      
      sections: {
        "🚀 Basic Trading": {
          start: "Start autonomous trading (30-second intervals)",
          stop: "Smart stop - panic if positions open, normal stop if not",
          status: "Full agent status (balance, P&L, strategy, positions)",
          positions: "View current open positions",
          closeAll: "Close all positions immediately"
        },
        
        "⚡ Hypertrading & Deposits": {
          depositStatus: "Check balance and hypertrading eligibility (50k sats minimum)",
          checkBalance: "View account balance in sats and USD",
          depositInstructions: "Get Lightning Network deposit address and QR code",
          createInvoice: "Create custom Lightning invoice (e.g., createInvoice 100000)",
          hypertradingCheck: "Detailed eligibility check for hypertrading",
          dailyLimits: "View remaining daily trading limits"
        },
        
        "🧠 Trading Strategies": {
          analyze: "Basic market analysis (moving averages, RSI)",
          analyzeEnhanced: "Advanced analysis (MACD, RSI divergence, StochRSI)",
          enhancedStrategy: "Switch to enhanced multi-indicator strategy",
          switchStrategy: "Switch between basic/enhanced strategies",
          compareStrategies: "Compare performance of both strategies"
        },
        
        "🚨 Emergency Controls": {
          panic: "Emergency stop - shows positions and asks for confirmation",
          emergency: "Same as panic - emergency position closure",
          confirmPanic: "Confirm emergency closure (after panic command)"
        },
        
        "📊 Monitoring": {
          metrics: "Risk metrics and performance stats",
          trade: "Force a single trading decision",
          menu: "Show this menu",
          help: "Show help information"
        }
      },
      
      quickStart: [
        "1. Check deposit status: goose 'Run goose-trading-agent/goose-entry.js depositStatus'",
        "2. Get deposit address: goose 'Run goose-trading-agent/goose-entry.js depositInstructions'", 
        "3. Deposit 50k+ sats via Lightning Network",
        "4. Start trading: goose 'Run goose-trading-agent/goose-entry.js start'",
        "5. Monitor: goose 'Run goose-trading-agent/goose-entry.js status'",
        "6. Emergency stop: goose 'Run goose-trading-agent/goose-entry.js stop'"
      ],
      
      safetyFeatures: [
        "⚡ Minimum 50k sats (~$25-50) for hypertrading",
        "🛑 Maximum 1M sats (~$500-1000) safety limit", 
        "💰 $100 max position size with 2x leverage",
        "🚨 Emergency panic button with confirmation",
        "📉 2% stop losses on all positions",
        "⏰ 30-second decision intervals for dopamine hits",
        "🎯 Real-time trade execution notifications"
      ],
      
      tips: [
        "💡 Use 'enhancedStrategy' for better signal accuracy",
        "💡 'depositStatus' shows exactly how many sats you need",
        "💡 'stop' is smart - triggers panic if you have positions",
        "💡 All balances shown in sats (proper Bitcoin behavior)",
        "💡 Set phone down and let it trade autonomously",
        "💡 Check 'status' anytime for dopamine hit updates"
      ]
    };
  },

  help: async () => {
    return {
      success: true,
      title: "🦆 Skayn.ai Help",
      description: "Autonomous Bitcoin trading system inspired by geese flying in formation",
      
      basicUsage: {
        description: "All commands use this format:",
        example: "goose \"Run goose-trading-agent/goose-entry.js <command>\"",
        commands: [
          "menu - Show full command menu",
          "status - Check everything", 
          "start - Begin trading",
          "stop - Stop (smart panic if positions open)",
          "depositStatus - Check balance requirements"
        ]
      },
      
      hypertrading: {
        description: "Low-barrier Bitcoin trading with micro-positions",
        minimum: "50,000 sats (~$25-50 depending on BTC price)",
        maxPosition: "$100 per trade with 2x max leverage",
        frequency: "Decisions every 30 seconds",
        safetyLimits: "2% stop losses, daily loss limits, position limits"
      },
      
      strategies: {
        basic: "Moving averages + RSI + Bollinger Bands",
        enhanced: "MACD + RSI divergence + StochRSI + EMA crossovers + confluence",
        switching: "Performance-based auto-switching available"
      },
      
      emergency: {
        description: "Multiple ways to stop trading immediately",
        commands: ["stop", "panic", "emergency"],
        process: "Shows positions → asks confirmation → closes everything → stops trading",
        timeout: "Confirmation expires after 5 minutes"
      },
      
      deposits: {
        method: "Lightning Network only (instant)",
        address: "Use 'depositInstructions' to get QR code",
        fees: "Free deposits, ~0.1% trading fees",
        supported: "Any Lightning wallet (Phoenix, Breez, Wallet of Satoshi, etc.)"
      },
      
      support: {
        commands: "Use 'menu' to see all available commands",
        status: "Use 'status' to check if everything is working",
        github: "https://github.com/jaca8602/skayn-ai",
        issues: "Report bugs on GitHub issues page"
      }
    };
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