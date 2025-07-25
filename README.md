# 🪿 Skayn.ai - Autonomous Bitcoin Trading Agent

**Intelligent autonomous Bitcoin trading powered by Goose framework and real-time market data.**

Skayn.ai combines Lightning Network integration, advanced technical analysis, and AI-driven decision making to create a fully autonomous Bitcoin trading system. Built for the Goose grant program with production-ready features.

---

## ✨ Key Features

### 🚀 **Autonomous Trading**
- **Hypertrading Mode**: Aggressive 60-second decision intervals with $100 positions
- **Real-time Price Data**: Coinbase API with Kraken/CoinGecko backups (no more rate limiting!)
- **Multi-strategy Support**: Basic MA crossover + Enhanced multi-indicator analysis
- **Smart Position Management**: Automatic stop losses and profit taking

### ⚡ **Lightning Network Integration**
- **Instant Deposits**: Lightning Network QR codes for seamless funding
- **Testnet Ready**: Full LN Markets testnet integration
- **Satoshi Native**: All balances in sats 

### 🎯 **Advanced Risk Management**
- **Position Limits**: Max 3 concurrent positions, $100 each
- **Stop Losses**: Automatic 2% stop losses (production) 
- **Daily Limits**: $50 max daily loss protection
- **Portfolio Heat**: 6% total risk exposure limit

### 🧠 **Goose AI Integration**
- **Grant Application Ready**: Built specifically for Goose framework
- **Intelligent Orchestration**: AI-driven decision synthesis
- **Command Interface**: Simple commands powered by Goose reasoning

---

## 🚀 Quick Start

### 1. **Setup**
```bash
# Clone and install
git clone https://github.com/jaca8602/skayn-ai.git
cd skayn-ai
npm install

# Setup environment
cp .env.example .env
# Add your LN Markets testnet credentials from https://testnet.lnmarkets.com/
```

### 2. **Simple Commands** (Recommended)
```bash
# Start autonomous trading
./skayn start

# Check status
./skayn status

# Emergency stop (close all positions)
./skayn panic
./skayn confirm-panic

# View all commands
./skayn help
```

### 3. **Live Management** (While Trading)
```bash
# In another terminal while agent is running:
./live-status.sh    # Check current status
./live-panic.sh     # Emergency stop
./live-stop.sh      # Stop agent
```

### 4. **Advanced Commands**
```bash
# Trading controls
./skayn force          # Force a trading decision
./skayn close-all      # Close all positions
./skayn enhanced       # Enable advanced strategy

# Account management  
./skayn balance        # Check balance
./skayn invoice 50000  # Create 50k sat deposit
./skayn limits         # Check daily limits

# Strategy comparison
./skayn compare        # Compare strategy performance
```

---

## 🏗️ Architecture

### **Core Components**
```
🪿 Block's Goose Framework
    ↓ Natural Language Commands
🌉 MCP Extension (8 Trading Tools)
    ↓ JSON-RPC Calls
⚙️ Skayn.ai Trading Engine
    ↓ REST/WebSocket APIs
🏪 LN Markets Exchange
    ↓ Lightning Network ⚡
₿ Bitcoin Mainnet
```

### **File Structure**
- `./skayn` - Simple command interface
- `src/skayn/trading-agent.js` - Main Skayn.ai trading logic
- `src/core/market-data.js` - Real-time price data (Coinbase API)
- `src/risk/risk-manager.js` - Position sizing and risk controls
- `src/strategies/` - Trading strategies (basic + enhanced)
- `src/utils/price-service.js` - Multi-API price service with rate limiting

---

## 📊 Trading Strategies

### **Basic Strategy**
- Moving Average crossovers (SMA 10/30)
- RSI oversold/overbought signals
- Bollinger Bands mean reversion

### **Enhanced Strategy**
- MACD histogram analysis
- RSI divergence detection  
- Stochastic RSI momentum
- EMA crossovers (9/21)
- Multi-indicator confluence scoring

### **Strategy Switching**
```bash
./skayn enhanced        # Enable advanced strategy
./skayn strategy basic  # Switch to basic strategy  
./skayn compare         # Compare performance
```

---

## 🛡️ Safety Features

### **Rate Limiting Protection**
- 90-second price data caching
- Maximum 50 API calls per hour
- Automatic fallback to backup APIs
- No more CoinGecko rate limit errors!

### **Risk Controls**
- **Position Limits**: Max 3 positions, $100 each
- **Stop Losses**: Automatic 2% protection
- **Daily Limits**: $50 max daily loss
- **Emergency Stop**: Panic button closes all positions

### **Testnet Safety**
- Testnet-only by default
- Mock balance system ($1000 virtual)
- No real money at risk during testing

---

## 🔬 Research Roadmap

### **Phase 1: On-Chain Analytics**
- [ ] CryptoQuant API (exchange flows, reserves)
- [ ] Glassnode integration (MVRV, SOPR, active addresses)
- [ ] Exchange flow analysis

### **Phase 2: Multi-Source Intelligence**
- [ ] CSV data ingestion for backtesting
- [ ] Social sentiment 

### **Phase 3: Advanced Fusion**
- [ ] Multi-source signal fusion engine
- [ ] Real-time research dashboard
- [ ] Custom research data uploads

*See `RESEARCH_ROADMAP.md` for detailed implementation plan.*

---

## 🚨 Emergency Procedures

### **Panic Button System**
```bash
# Step 1: Request emergency stop
./skayn panic

# Step 2: Confirm to close all positions  
./skayn confirm-panic

# Alternative: While agent is running
./live-panic.sh
```

### **If Agent is Stuck**
```bash
# Force stop from another terminal
./live-stop.sh

# Or kill the process
pkill -f "node goose-entry.js"
```

---

## 📈 Performance Monitoring

### **Real-time Status**
```bash
./skayn status    # Full status report
```

**Sample Output:**
```json
{
  "running": true,
  "currentPrice": "$115,234.56",
  "activePositions": 2,
  "netPnL": "+$12.34",
  "totalTrades": 15,
  "winRate": "73.3%"
}
```

### **Live Monitoring** 
```bash
./live-status.sh    # Status while trading
tail -f logs/combined.log    # Live logs
```

---

## 🛠️ Development

### **Testing**
```bash
# Test price service
node -e "require('./src/utils/price-service').getBitcoinPrice().then(console.log)"

# Test trading agent
./skayn start    # Watch for aggressive trades

# Test panic system
./skayn panic
./skayn confirm-panic
```

### **Configuration**
Edit `config/trading.config.js`:
```javascript
{
  trading: {
    maxPositionSize: 100,    // $100 positions
    maxLeverage: 2,          // 2x leverage
    stopLossPercentage: 2    // 2% stop loss
  },
  goose: {
    decisionInterval: 60000  // 60 second decisions
  }
}
```

---

## 🏆 Grant Application

**Built for Block's Goose Grant Program:**
- ✅ Real Block Goose framework integration (MCP extension)
- ✅ Autonomous decision making
- ✅ Production-ready architecture  
- ✅ Real Bitcoin market integration
- ✅ Comprehensive logging and monitoring
- ✅ Emergency safety controls

**Demo Ready:**
- Real-time Bitcoin price data
- Aggressive trading for demonstrations
- Easy command interface
- Live position monitoring

---

## 📞 Support

- **GitHub Issues**: [Report bugs](https://github.com/jaca8602/skayn-ai/issues)
- **Rate Limiting**: Fixed with multi-API backup system
- **Emergency**: Use panic button or `./live-stop.sh`

---

## 📄 License

MIT License - Built with ❤️ for the Goose ecosystem

---

*🪿 "Like geese flying in formation, Skayn.ai agents work together to achieve financial freedom through Bitcoin's sound money."*
