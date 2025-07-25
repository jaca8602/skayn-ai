# Skayn.ai x Block Goose AI Framework Integration

This repository integrates **Skayn.ai Bitcoin Trading Agent** with **Block's Goose AI framework** to provide autonomous Bitcoin trading capabilities through AI-powered decision making.

## 🪿 Block Goose Framework Integration

### MCP Extension Setup

1. **Install Block's Goose CLI:**
   ```bash
   curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash
   export PATH="/Users/$USER/.local/bin:$PATH"
   ```

2. **Install Extension Dependencies:**
   ```bash
   cd goose-extensions/bitcoin-trading-extension
   npm install
   ```

3. **Configure Goose to use the Bitcoin Trading Extension:**
   Add this to your `~/.config/goose/config.yaml`:
   ```yaml
   mcp:
     servers:
       skayn-bitcoin-trading:
         command: node
         args:
           - /path/to/goose-trading-agent/goose-extensions/bitcoin-trading-extension/server.js
         env:
           NODE_ENV: production
   ```

### Available Goose Tools

When running `goose session`, you'll have access to these Bitcoin trading tools:

- **start_trading** - Start autonomous Bitcoin trading
- **stop_trading** - Stop trading (with emergency option)
- **check_positions** - View current trading positions
- **get_trading_status** - Comprehensive agent status
- **check_balance** - Lightning Network balance
- **create_deposit_invoice** - Generate Lightning deposit invoices
- **switch_strategy** - Change trading strategies
- **force_trade_decision** - Force immediate trading decision

### Usage Examples

```bash
# Start Goose session with Bitcoin trading capabilities
goose session

# In Goose, use natural language:
"Start Bitcoin trading on mainnet"
"Check my current positions and P&L"
"Create a Lightning invoice for 50,000 sats"
"Switch to enhanced trading strategy"
"Show me my account balance"
```

## 🚀 Direct CLI Usage

You can also use the trading agent directly without Goose:

```bash
# Traditional CLI commands
./skayn start          # Start autonomous trading
./skayn positions      # Check positions
./skayn balance        # Check balance
./skayn stop           # Stop trading
```

## 🧠 AI-Powered Features

### Block Goose Integration Benefits

1. **Natural Language Interface** - Control trading through conversational AI
2. **Context Awareness** - Goose understands trading state and market conditions
3. **Multi-Modal Capabilities** - Combine trading with other Goose tools
4. **Workflow Automation** - Create complex trading workflows

### Trading Strategies

- **Basic Strategy**: Moving averages + RSI + Bollinger Bands
- **Enhanced Strategy**: MACD + RSI divergence + StochRSI + EMA crossovers
- **AI-Powered Decisions**: Goose can analyze market conditions and choose strategies

## ⚡ Lightning Network Integration

- **Instant Deposits**: Lightning Network for fast funding
- **Low Fees**: Minimal trading fees compared to traditional exchanges
- **Real-time Trading**: Sub-second execution on LN Markets
- **Micro-positions**: Trade with as little as $6 positions

## 🛡️ Safety Features

- **Emergency Stop**: Panic button accessible through Goose
- **Position Limits**: Maximum position sizes and leverage limits
- **Risk Management**: Automated stop losses and daily limits
- **Real-time Monitoring**: Continuous position and P&L tracking

## 📊 Grant Application Compliance

This project demonstrates:

1. **Block Goose Framework Integration**: Custom MCP extension for Bitcoin trading
2. **AI Agent Capabilities**: Autonomous decision making with market analysis  
3. **Real-world Application**: Live Bitcoin trading on Lightning Network
4. **Open Source**: Available for community use and contribution
5. **Innovation**: Combining AI agents with Bitcoin/Lightning infrastructure

## 🔧 Technical Architecture

```
Goose Framework
    ↓ (MCP Protocol)
Bitcoin Trading Extension
    ↓ (Node.js API)
Skayn Trading Agent
    ↓ (REST/WebSocket)
LN Markets API
    ↓ (Lightning Network)
Bitcoin Mainnet
```

## 📈 Development Roadmap

- [x] Block Goose framework integration
- [x] MCP extension development
- [x] Lightning Network trading
- [x] Real-time market analysis
- [ ] Multi-exchange support
- [ ] Advanced AI strategies
- [ ] Portfolio optimization
- [ ] Social trading features

## 🏆 Grant Application Summary

**Skayn.ai** demonstrates the power of Block's Goose AI framework by enabling:

- **Autonomous Bitcoin Trading** through natural language commands
- **Lightning Network Integration** for instant, low-fee transactions
- **Real-time Market Analysis** with AI-powered decision making
- **Custom MCP Extensions** showing Goose's extensibility
- **Open Source Innovation** in the Bitcoin/AI space

This project showcases how Goose can be extended to interact with real-world financial systems, providing a foundation for the future of AI-powered trading and DeFi applications.