#!/usr/bin/env node

/**
 * Skayn.ai CLI Entry Point
 * Wrapper for the trading agent with Block's Goose framework integration
 */

const { initializeAgent } = require('./index');
const logger = require('./src/utils/logger');
const config = require('./config/trading.config');

// Command handlers for the CLI
const commands = {
  start: async (params) => {
    // Check if strategy is specified via parameters
    let strategy = params && params[0] ? params[0].toLowerCase() : null;
    
    if (!strategy) {
      // Show strategy selection menu
      return {
        success: true,
        message: "🚀 Choose Your Trading Strategy",
        strategies: {
          conservative: {
            description: "Safe & Steady (Recommended for beginners)",
            features: [
              "📊 2% stop losses, 3% profit targets",
              "💰 $8 position sizes, 1.5x max leverage", 
              "📈 Basic indicators (SMA, RSI, Bollinger)",
              "⏰ 60-second decision intervals",
              "🛡️ Maximum safety, lower risk"
            ],
            command: "./skayn start conservative"
          },
          enhanced: {
            description: "Advanced & Dynamic (More aggressive)",
            features: [
              "📊 Dynamic stop losses (1.5-3%), 4-6% profit targets",
              "💰 Dynamic sizing ($5-$15), 2x max leverage",
              "📈 Advanced indicators (MACD, RSI divergence, StochRSI)",
              "⏰ 30-second decision intervals", 
              "🎯 Multi-timeframe confluence analysis"
            ],
            command: "./skayn start enhanced"
          },
          adaptive: {
            description: "AI-Optimized (Premium)",
            features: [
              "🧠 Claude analysis of CSV market data",
              "📊 Pattern correlation detection with success rates",
              "💡 Human-in-the-loop confirmation (y/n)",
              "🎯 Confidence-based position sizing (6-10 scale)",
              "✨ Premium UX with detailed reasoning"
            ],
            command: "./skayn start adaptive"
          }
        },
        note: "Choose a strategy by running one of the commands above",
        default: "If unsure, start with: ./skayn start conservative"
      };
    }
    
    // Validate strategy choice
    if (!['conservative', 'enhanced', 'adaptive'].includes(strategy)) {
      return {
        success: false,
        error: `Invalid strategy: ${strategy}`,
        available: ['conservative', 'enhanced', 'adaptive'],
        message: "Use ./skayn start to see strategy options"
      };
    }
    
    // Handle adaptive strategy
    if (strategy === 'adaptive') {
      const agent = await initializeAgent();
      
      // Set strategy in agent config
      agent.config.strategy = 'adaptive';
      agent.currentStrategyType = 'adaptive';
      
      // Start the adaptive strategy with continuous analysis
      await agent.startAdaptiveStrategy();
      
      return {
        success: true,
        status: 'started',
        mode: 'adaptive',
        strategy: 'adaptive',
        message: "🧠 Adaptive Strategy Started",
        description: "Claude will analyze market data and suggest trades for your confirmation",
        features: [
          "CSV market data collection every hour",
          "Claude pattern analysis with confidence scoring",
          "Premium confirmation UX with detailed reasoning",
          "Automatic take profit targets based on confidence"
        ],
        nextSteps: [
          "Wait for Claude analysis (automatic every hour)",
          "Use './skayn analyze' to trigger immediate analysis",
          "Review and confirm trades when prompted"
        ]
      };
    }
    
    const agent = await initializeAgent();
    
    // Set strategy in agent config
    agent.config.strategy = strategy;
    agent.currentStrategyType = strategy;
    
    await agent.start();
    return { 
      status: 'started', 
      mode: agent.config.mode,
      strategy: strategy,
      message: `🚀 Trading started with ${strategy} strategy`,
      features: strategy === 'conservative' ? 
        ['2% stop losses', '3% profit targets', '$8 positions', 'Basic indicators'] :
        ['Dynamic stop losses', '4-6% profit targets', 'Dynamic sizing', 'Advanced indicators']
    };
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
    
    // If using adaptive strategy, trigger Claude analysis
    if (agent.currentStrategyType === 'adaptive' || agent.config.strategy === 'adaptive') {
      try {
        const adaptiveResult = await agent.runAdaptiveAnalysis();
        return {
          strategy: 'adaptive',
          analysisType: 'Claude Pattern Recognition',
          result: adaptiveResult,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          strategy: 'adaptive',
          error: error.message,
          fallback: 'Using basic analysis'
        };
      }
    }
    
    // Standard analysis for other strategies
    const marketMetrics = agent.marketData.getMarketMetrics();
    const signal = agent.strategy.analyze();
    return { marketMetrics, signal };
  },

  positions: async () => {
    // Keep using the full agent for production safety - just clean the output
    const agent = await initializeAgent();
    
    try {
      const positions = await agent.lnMarketsClient.restClient.futuresGetTrades({ type: 'running' });
      const currentPrice = agent.marketData.getLatestPrice();
      
      if (positions.length === 0) {
        console.log(`
📊 NO ACTIVE POSITIONS
${'─'.repeat(50)}
❌ No open positions found  
💳 Balance: ${agent.lnMarketsClient.balance} sats available
🪿 Skayn ready to trade when you start a strategy
${'─'.repeat(50)}
        `);
        return { success: true };
      }
      
      console.log(`
📊 ACTIVE POSITIONS (${positions.length})
${'─'.repeat(50)}`);
      
      positions.forEach(pos => {
        const isLong = pos.side === 'b';
        const pnlSats = isLong ? 
          (currentPrice - pos.entry_price) * (pos.quantity / 100000000) * 100000000 :
          (pos.entry_price - currentPrice) * (pos.quantity / 100000000) * 100000000;
        
        console.log(`🆔 ${pos.id.slice(-8)} | ${isLong ? '🟢 LONG' : '🔴 SHORT'} ${pos.running ? '✅ OPEN' : '❌ CLOSED'}`);
        console.log(`💰 Entry: $${pos.entry_price.toLocaleString()} | Margin: ${pos.margin} sats`);
        console.log(`📊 Current: $${currentPrice.toLocaleString()} | P&L: ${pnlSats > 0 ? '+' : ''}${Math.round(pnlSats)} sats`);
        console.log(`⏰ ${Math.floor((Date.now() - pos.creation_ts) / 60000)}min ago | 🪿 Skayn monitoring`);
        console.log('─'.repeat(50));
      });
      
      console.log(`💳 Balance: ${agent.lnMarketsClient.balance} sats available\n`);
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
    
    return { success: true };
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
      subtitle: "Lightning-powered hypertrading with Block's Goose AI framework integration",
      
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
          analyze: "Market analysis (adaptive uses Claude, others use indicators)",
          analyzeEnhanced: "Advanced analysis (MACD, RSI divergence, StochRSI)",
          enhancedStrategy: "Switch to enhanced multi-indicator strategy",
          switchStrategy: "Switch between conservative/enhanced/adaptive strategies",
          compareStrategies: "Compare performance of all strategies"
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
        "1. Check deposit status: ./skayn depositStatus",
        "2. Get deposit address: ./skayn depositInstructions", 
        "3. Deposit 50k+ sats via Lightning Network",
        "4. Start trading: ./skayn start",
        "5. Monitor: ./skayn status",
        "6. Emergency stop: ./skayn stop"
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
      
      gooseIntegration: [
        "🪿 Built with Block's Goose AI framework",
        "🔌 Custom MCP extension for Bitcoin trading",
        "🤖 AI-powered autonomous decision making",
        "🔄 Real-time market analysis and execution"
      ]
    };
  },

  help: async () => {
    return {
      success: true,
      title: "🪿 Skayn.ai Help",
      description: "Autonomous Bitcoin trading system with Block's Goose AI framework integration",
      
      basicUsage: {
        description: "All commands use this format:",
        example: "./skayn <command>",
        commands: [
          "menu - Show full command menu",
          "status - Check everything", 
          "start - Begin trading",
          "stop - Stop (smart panic if positions open)",
          "depositStatus - Check balance requirements"
        ]
      },
      
      gooseFramework: {
        description: "Integration with Block's Goose AI framework",
        features: [
          "MCP extension for Bitcoin trading tools",
          "AI-powered autonomous trading decisions", 
          "Real-time market analysis capabilities",
          "Lightning Network integration"
        ],
        usage: "Use with Goose CLI: goose session"
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

// Parse input
async function handleCommand(input) {
  try {
    const [command, ...args] = input.trim().split(' ');
    
    if (!commands[command]) {
      return {
        error: 'Unknown command',
        availableCommands: Object.keys(commands),
        usage: './skayn <command> [args...]'
      };
    }

    logger.info(`🔄 Executing Skayn command: ${command}`, { command, args });
    const result = await commands[command](args);
    
    return {
      success: true,
      command,
      result,
      timestamp: new Date().toISOString(),
      framework: 'Block Goose AI Integration'
    };
  } catch (error) {
    logger.error('Skayn command error', error);
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
    console.log(`
🪿 Skayn.ai - Bitcoin Trading Agent

Quick Start:
  ./skayn help         - Show all commands
  ./skayn start        - Choose trading strategy 
  ./skayn status       - Check positions & balance
  ./skayn stop         - Stop trading
  ./skayn positions    - View open positions

⚠️  🪿 Skayn automatically closes trades at profit targets
Need help? Run: ./skayn help
`);
    return;
  }

  const result = await handleCommand(input);
  
  // Clean output for specific commands, JSON for others
  if (input.includes('help') || input.includes('menu')) {
    // Help and menu have their own clean output
    return;
  } else if (input.includes('positions') || input.includes('status')) {
    // These should have clean output, not JSON
    return;
  } else if (input.startsWith('start')) {
    // Start command should show clean confirmation
    if (result.success) {
      console.log(`✅ ${result.result.message}`);
      console.log(`📊 Strategy: ${result.result.strategy || result.result.mode}`);
      if (result.result.nextSteps) {
        console.log('\nNext steps:');
        result.result.nextSteps.forEach(step => console.log(`  • ${step}`));
      }
    } else {
      console.log(`❌ Error: ${result.error}`);
    }
    return;
  }
  
  // Fallback to JSON for other commands
  console.log(JSON.stringify(result, null, 2));
  
  // Keep process alive for start command
  if (input.startsWith('start')) {
    logger.info('Agent started via Skayn CLI. Process will continue running...');
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

module.exports = { handleCommand };