# 📁 Skayn.ai File Structure & Core Components

## 🏗️ **Complete Architecture**

```
┌─────────────────────────┐
│   Block's Goose CLI     │  ← The AI framework (by Block)
│   (Natural Language)    │
└────────────┬────────────┘
             │ Commands: "Start trading", "Check positions"
             ▼
┌─────────────────────────┐
│   MCP Extension         │  ← Your bridge (you built this)
│   /goose-extensions/    │
└────────────┬────────────┘
             │ Translates to Skayn.ai API calls
             ▼
┌─────────────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│     Price APIs          │    │  Skayn.ai Core   │    │   LN Markets    │
│  Coinbase/Kraken        │◄──►│  Trading Engine  │◄──►│    (Bitcoin)    │
│   (Market Data)         │    │  Risk Management │    │   Derivatives   │
└─────────────────────────┘    └──────────────────┘    └─────────────────┘
              │                         │                         │
              └─────────────────────────┼─────────────────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │      Lightning Network      │
                        │    Instant Settlements      │
                        └─────────────────────────────┘
```

## 📂 **File Structure**

```
skayn-ai/
│
├── 🚀 Entry Points
│   ├── ./skayn                          # CLI interface for direct trading
│   ├── skayn-cli.js                     # Command handler for CLI
│   └── index.js                         # Main application entry
│
├── 🪿 Block Goose Integration
│   └── goose-extensions/
│       └── bitcoin-trading-extension/
│           ├── server.js                # MCP server for Block's Goose
│           ├── package.json             # MCP dependencies
│           └── README.md                # Extension documentation
│
├── 💼 Core Trading System (src/)
│   ├── skayn/
│   │   └── trading-agent.js             # Main Skayn.ai trading logic
│   │
│   ├── core/
│   │   ├── lnmarkets.js                 # LN Markets API integration
│   │   ├── market-data.js               # Real-time price feeds
│   │   └── deposit-manager.js           # Lightning deposit handling
│   │
│   ├── strategies/
│   │   ├── moving-average-strategy.js   # Basic MA/RSI strategy
│   │   └── enhanced-strategy.js         # Advanced MACD/StochRSI
│   │
│   ├── risk/
│   │   └── risk-manager.js              # Position sizing & limits
│   │
│   └── utils/
│       ├── logger.js                    # Winston logging
│       ├── price-service.js             # Multi-API price fetching
│       └── pnl-tracker.js               # P&L calculations
│
├── ⚙️ Configuration
│   ├── config/
│   │   └── trading.config.js            # Trading parameters
│   ├── .env.example                     # Environment template
│   └── .env                             # Your API keys (not in git)
│
├── 📊 Outputs
│   └── logs/
│       ├── combined.log                 # All application logs
│       ├── error.log                    # Error tracking
│       └── pnl-history.json             # Trading performance
│
└── 📚 Documentation
    ├── README.md                        # Main documentation
    ├── LIGHTNING_TESTING.md             # Lightning Network guide
    └── GOOSE-TEST-RESULTS.md            # Integration validation
```

## 🔑 **Key Components Explained**

### **1. Skayn.ai Trading Engine** (`src/skayn/trading-agent.js`)
- The brain of the trading system
- Executes trading strategies autonomously
- Manages positions and risk
- NOT part of Block's Goose - this is YOUR trading system

### **2. MCP Extension** (`goose-extensions/bitcoin-trading-extension/`)
- Bridge between Block's Goose and Skayn.ai
- Translates natural language to trading commands
- Implements 8 tools for Goose to call
- This is what makes Goose "understand" Bitcoin trading

### **3. Market Data** (`src/core/market-data.js`)
- Fetches real-time Bitcoin prices
- Primary: Coinbase API
- Fallback: Kraken, CoinGecko
- WebSocket for live updates

### **4. Risk Management** (`src/risk/risk-manager.js`)
- Position sizing ($8 max by default)
- Daily loss limits ($5 max)
- Stop loss automation (2%)
- Emergency controls

### **5. Lightning Integration** (`src/core/lnmarkets.js`)
- Connects to LN Markets exchange
- Executes Bitcoin derivative trades
- Handles Lightning deposits/withdrawals
- Real money, real profits

## 🔄 **Data Flow**

1. **User** → speaks to Block's Goose: "Start Bitcoin trading"
2. **Block's Goose** → calls MCP extension tool: `start_trading`
3. **MCP Extension** → calls Skayn.ai API: `agent.start()`
4. **Skayn.ai** → analyzes market → executes trade on LN Markets
5. **LN Markets** → settles via Lightning Network
6. **Result** → flows back up to user via Goose

## 🎯 **Important Distinctions**

- **Block's Goose** = The AI framework (like an operating system)
- **Skayn.ai** = Your Bitcoin trading application
- **MCP Extension** = The adapter that connects them
- **Result** = Goose can now trade Bitcoin through Skayn.ai