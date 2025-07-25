# 🪿 Skayn.ai

**Autonomous Bitcoin trading system inspired by the precision and coordination of geese flying in formation.**

Skayn.ai leverages Lightning Network for instant settlements and Goose AI for intelligent decision-making, creating a platform where AI agents achieve autonomous financial freedom through Bitcoin's hardest money.

## Features

- **LN Markets Integration**: Full testnet API integration with real-time WebSocket data
- **Autonomous Trading**: Moving average strategy with RSI and Bollinger Bands
- **Risk Management**: Position limits, stop losses, daily loss limits, drawdown protection
- **Goose Compatible**: Modular architecture designed for Goose agent orchestration
- **Real-time Monitoring**: Comprehensive logging and performance tracking

## Quick Start

### 1. Setup Credentials

Copy `.env.example` to `.env` and add your LN Markets testnet credentials:

```bash
cp .env.example .env
```

Get testnet credentials from: https://testnet.lnmarkets.com/

### 2. Install Dependencies

```bash
npm install
```

### 3. Run with Node.js

```bash
# Start autonomous trading
node index.js

# Check status
node index.js status

# Execute specific commands
node index.js start
node index.js stop
node index.js close-all
```

### 4. Execute with Goose

```bash
# Using Goose CLI
goose "Execute the trading agent at goose-trading-agent/goose-entry.js start"

# Check agent status
goose "Run goose-trading-agent/goose-entry.js status and show me the results"

# Analyze market
goose "Use goose-trading-agent/goose-entry.js analyze to check market conditions"
```

## Architecture

### Core Modules

- **LN Markets Client** (`src/core/lnmarkets.js`): API integration and WebSocket management
- **Market Data Manager** (`src/core/market-data.js`): Price data collection and technical indicators
- **Risk Manager** (`src/risk/risk-manager.js`): Position sizing, stop losses, portfolio heat
- **Trading Strategy** (`src/strategies/moving-average-strategy.js`): Signal generation
- **Goose Agent** (`src/goose/trading-agent.js`): Autonomous decision-making engine

### Goose Integration Points

1. **goose-entry.js**: Primary interface for Goose commands
2. **Modular Architecture**: Each component can be executed independently
3. **Command Interface**: Structured for Goose orchestration
4. **Logging System**: Goose-specific action and decision logging

## Configuration

Edit `config/trading.config.js` or use environment variables:

- `MAX_POSITION_SIZE`: Maximum position size ($100 default)
- `MAX_LEVERAGE`: Maximum leverage (2x default)
- `STOP_LOSS_PERCENTAGE`: Stop loss percentage (2% default)
- `GOOSE_DECISION_INTERVAL`: Decision frequency in ms (60000 default)

## Risk Management

- Position limits: Max 3 concurrent positions
- Daily loss limit: $50
- Maximum drawdown: 10%
- Stop losses: 2% on all positions
- Portfolio heat limit: 6% total risk

## Monitoring

Logs are stored in the `logs/` directory:
- `combined.log`: All agent activity
- `error.log`: Error tracking
- `trades.log`: Trade execution history

## Deployment

### Digital Ocean

```bash
# Build for deployment
npm run build

# Start with PM2
pm2 start index.js --name goose-trading-agent

# Monitor
pm2 logs goose-trading-agent
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "index.js"]
```

## Safety Features

- Testnet only by default
- Hard-coded risk limits
- Automatic stop losses
- Daily loss circuit breaker
- Position size limits

## Development

```bash
# Run in development mode
NODE_ENV=development node index.js

# Test specific components
node -e "require('./index').initializeAgent().then(a => console.log(a.getStatus()))"
```

## License

MIT
