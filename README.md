# 🪿 Skayn.ai - Autonomous Bitcoin Trading Agent

**AI-powered Bitcoin trading with Block's Goose framework integration** 🪿✨

Skayn.ai is an autonomous Bitcoin trading system that combines Lightning Network integration, advanced technical analysis, and AI-driven decision making. Built with **Block's Goose AI framework** featuring custom MCP extensions for seamless AI-to-Bitcoin trading workflows.

---

## 🎯 **Quick Start**

### Option 1: Direct Trading (Node.js CLI) 🚀
```bash
# Clone and setup
git clone https://github.com/jaca8602/skayn-ai
cd skayn-ai
npm install

# Configure environment
cp .env.example .env
# Add your LN Markets API keys to .env

# Start trading
./skayn start
./skayn positions
./skayn stop
```

### Option 2: AI-Powered Trading (Goose Framework) 🪿🤖
```bash
# Install Block's Goose CLI
curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash
export PATH="/Users/$USER/.local/bin:$PATH"

# Setup MCP extension
cd goose-extensions/bitcoin-trading-extension
npm install
cd ../..

# Configure Goose (add to ~/.config/goose/config.yaml)
echo "mcp:
  servers:
    skayn-bitcoin-trading:
      command: node
      args: [$(pwd)/goose-extensions/bitcoin-trading-extension/server.js]" >> ~/.config/goose/config.yaml

# Start AI trading session 🪿
goose session
# Then: "Start Bitcoin trading" or "Check my positions"
```

---

## ✨ **Features**

### 🧠 **AI-Powered Trading** 🪿
- **Natural Language Control**: "Start trading", "Check positions", "Create invoice"
- **Block Goose Integration**: Custom MCP extension with 8 trading tools 🪿
- **Autonomous Decisions**: AI analyzes markets and executes trades
- **Multi-Strategy**: Basic (MA+RSI) and Enhanced (MACD+StochRSI) strategies

### ⚡ **Lightning Network Native**
- **Instant Deposits**: Lightning Network QR codes for funding
- **Mainnet Ready**: Real Bitcoin trading on LN Markets
- **Satoshi Precision**: All balances in sats (proper Bitcoin behavior)
- **Micro-Positions**: Trade with as little as $6 positions

### 🛡️ **Enterprise Safety**
- **Emergency Controls**: Panic button with confirmation
- **Risk Management**: Automated stop losses and position limits
- **Real-time Monitoring**: Live P&L and position tracking
- **Testing Mode**: Auto-detects small balances for safe testing

### 📊 **Technical Analysis**
- **Real-time Data**: Coinbase API with Kraken/CoinGecko backups
- **Advanced Indicators**: RSI, MACD, Bollinger Bands, EMA crossovers
- **Market Health**: Volatility detection and trend analysis
- **Performance Tracking**: Win rate, Sharpe ratio, drawdown monitoring

---

## 🏗️ **Architecture**

```
AI Layer (Goose Framework) 🪿
    ↓ Natural Language Commands
MCP Extension (Trading Bridge) 🌉
    ↓ Tool Calls
Core Trading Engine (Node.js) ⚙️
    ↓ REST/WebSocket APIs
LN Markets Exchange 🏪
    ↓ Lightning Network ⚡
Bitcoin Mainnet ₿
```

### **Dual Development Workflow** 🪿🔄

#### **Primary Development** (Node.js Core) 🛠️
- **Location**: `/src/`, `index.js`, `skayn-cli.js` 
- **Purpose**: All trading logic, strategies, risk management
- **Commands**: `./skayn start`, `npm run dev`
- **Testing**: Direct CLI for rapid iteration

#### **AI Integration** (Goose Extension) 🪿🔌
- **Location**: `/goose-extensions/bitcoin-trading-extension/`
- **Purpose**: MCP bridge between Goose AI and trading core
- **Commands**: `goose session`, natural language
- **Testing**: `node server.js` to test MCP tools

---

## 🚀 **Available Commands**

### Direct CLI Commands 💻
```bash
./skayn start              # Start autonomous trading
./skayn stop               # Smart stop (panic if positions open)
./skayn positions          # Check current positions
./skayn balance            # Check Lightning balance
./skayn invoice 50000      # Create Lightning invoice
./skayn strategy enhanced  # Switch to advanced strategy
./skayn panic              # Emergency position closure
```

### Goose AI Commands 🪿🗣️
```bash
# Start Goose session
goose session

# Natural language examples:
"Start Bitcoin trading on mainnet" 🪿
"Show me my current trading positions" 🪿
"Create a Lightning invoice for 100,000 sats" 🪿
"Switch to enhanced trading strategy" 🪿
"What's my account balance?" 🪿
"Emergency stop all trading" 🪿
```

---

## 📈 **Trading Strategies**

### **Basic Strategy** 📊
- Moving Average Crossovers (10/30 period)
- RSI Oversold/Overbought (30/70)
- Bollinger Band bounces
- Simple trend following

### **Enhanced Strategy** 🧠
- MACD signal line crossovers
- RSI divergence detection
- StochRSI momentum confirmation
- EMA crossover confluences
- Multi-timeframe analysis

### **AI Strategy Selection** 🪿🎯
Goose can analyze market conditions and automatically choose the optimal strategy based on:
- Current volatility
- Trend strength
- Historical performance
- Risk/reward ratios

---

## ⚙️ **Configuration**

### Environment Variables 🔧
```bash
# LN Markets API (required)
LN_MARKETS_KEY=your_api_key
LN_MARKETS_SECRET=your_api_secret
LN_MARKETS_PASSPHRASE=your_passphrase
LN_MARKETS_NETWORK=mainnet  # or testnet

# Trading Parameters
MAX_POSITION_SIZE=8         # USD per position
MAX_LEVERAGE=1              # Conservative leverage
RISK_LEVEL=medium           # conservative, medium, ultra_degen

# AI Integration (optional) 🪿
ANTHROPIC_API_KEY=your_key  # For Goose framework
```

### Risk Management 🛡️
```javascript
// config/trading.config.js
risk: {
  maxDailyLoss: 5,           // $5 max daily loss
  maxDrawdownPercentage: 10, // 10% max drawdown
  stopLossPercentage: 2,     // 2% stop losses
  maxPositions: 2,           // Max concurrent positions
  minPositionSize: 6         // $6 minimum position
}
```

---

## 🔧 **Development**

### **Core Trading Development** 🛠️
```bash
# Install dependencies
npm install

# Development mode with hot reload
npm run dev

# Test trading logic
./skayn analyze
./skayn force

# Monitor logs
tail -f logs/combined.log
```

### **Goose Extension Development** 🪿⚒️
```bash
# Navigate to extension
cd goose-extensions/bitcoin-trading-extension

# Install MCP dependencies
npm install

# Test extension directly
node server.js

# Test with Goose 🪿
goose session
```

### **Adding New Trading Features** ➕
1. **Core Logic**: Add to `/src/strategies/` or `/src/core/`
2. **CLI Access**: Update `skayn-cli.js` commands
3. **AI Access**: Add tool to MCP extension `server.js` 🪿
4. **Testing**: Test both direct CLI and Goose integration

### **Adding New Goose Tools** 🪿🔧
```javascript
// In goose-extensions/bitcoin-trading-extension/server.js
{
  name: 'new_trading_tool',
  description: 'Description for AI 🪿',
  inputSchema: {
    type: 'object',
    properties: {
      parameter: { type: 'string', description: 'Parameter description' }
    }
  }
}
```

---

## 📊 **Monitoring & Analytics**

### **Real-time Status** 📈
```bash
./skayn status    # Comprehensive status
./skayn positions # Position details
./skayn metrics   # Performance metrics
```

### **Logs & History** 📝
- `logs/combined.log` - All application logs
- `logs/trades.log` - Trade execution history  
- `logs/pnl-history.json` - P&L tracking
- `logs/error.log` - Error debugging

### **Performance Metrics** 🎯
- **Win Rate**: Percentage of profitable trades
- **Sharpe Ratio**: Risk-adjusted returns
- **Max Drawdown**: Largest peak-to-trough decline
- **Average Win/Loss**: Position sizing efficiency

---

## 🛡️ **Security & Safety**

### **API Security** 🔐
- Environment variable configuration
- No hardcoded credentials
- Secure API key rotation support

### **Trading Safeguards** 🚨
- Maximum position size limits
- Daily loss limits with automatic shutoff
- Emergency panic button with confirmation
- Real-time position monitoring

### **Lightning Security** ⚡🔒
- Mainnet-ready with production safety limits
- Testnet support for development
- Invoice generation with expiration
- Balance verification before trades

---

## 🎯 **Use Cases**

### **Individual Traders** 👤
- Set-and-forget Bitcoin accumulation
- Dollar-cost averaging with AI timing 🪿
- 24/7 market monitoring and execution
- Lightning-fast deposit and withdrawal

### **Developers** 👨‍💻
- AI agent framework demonstration 🪿
- Lightning Network integration example
- Real-time trading system architecture
- Block Goose framework extension

### **Institutions** 🏢
- Automated Bitcoin treasury management
- Risk-controlled trading strategies
- Lightning Network payment integration
- Compliance-ready audit logs

---

## 🪿 **Block Goose Integration**

### **MCP Extension Features** 🪿🔌
- **8 Trading Tools**: Complete trading workflow coverage
- **Natural Language**: AI understands trading context 🪿
- **Real-time Data**: Live market and position information
- **Safety Controls**: Emergency stops via voice commands

### **Grant Application Compliance** 🏆
This project demonstrates:
- ✅ **Real Goose Framework Usage**: Custom MCP extension 🪿
- ✅ **AI Agent Capabilities**: Autonomous trading decisions 🪿
- ✅ **Production Application**: Live Bitcoin trading
- ✅ **Open Source**: Community contribution ready
- ✅ **Innovation**: AI + Bitcoin/Lightning integration 🪿

---

## 📚 **Documentation**

- **[Lightning Testing Guide](LIGHTNING_TESTING.md)** - Testnet setup and testing ⚡
- **[Goose Integration Guide](README-GOOSE-INTEGRATION.md)** - Detailed MCP setup 🪿
- **[Research Roadmap](RESEARCH_ROADMAP.md)** - Future development plans 🚀
- **[API Documentation](docs/api.md)** - Trading engine API reference 📖

---

## 🤝 **Contributing**

### **Core Trading Engine** 🛠️
1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-strategy`
3. Add trading logic in `/src/strategies/`
4. Test with `./skayn analyze`
5. Submit pull request

### **Goose AI Extensions** 🪿💡
1. Modify `/goose-extensions/bitcoin-trading-extension/server.js`
2. Add new MCP tools for AI interaction 🪿
3. Test with `goose session`
4. Document AI usage patterns

### **Development Priorities** 📋
- [ ] Multi-exchange support (Binance, Coinbase)
- [ ] Advanced AI strategies with machine learning 🪿🧠
- [ ] Social trading and copy-trading features
- [ ] Mobile app with Lightning integration 📱⚡
- [ ] DeFi protocol integrations

---

## 📄 **License**

MIT License - See [LICENSE](LICENSE) for details.

---

## 🔗 **Links**

- **GitHub**: https://github.com/jaca8602/skayn-ai
- **Block Goose Framework**: https://github.com/block/goose 🪿
- **LN Markets**: https://lnmarkets.com ⚡
- **Lightning Network**: https://lightning.network ⚡

---

**Built with ❤️ for the Bitcoin and AI communities** 🪿₿

*Combining the best of autonomous AI agents and Lightning Network technology* 🪿⚡✨