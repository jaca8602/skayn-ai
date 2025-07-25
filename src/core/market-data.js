const EventEmitter = require('events');
const logger = require('../utils/logger');
const axios = require('axios');

class MarketDataManager extends EventEmitter {
  constructor(lnMarketsClient) {
    super();
    this.lnMarketsClient = lnMarketsClient;
    this.priceHistory = [];
    this.currentPrice = null;
    this.priceUpdateInterval = null;
    this.maxHistoryLength = 1000;
    this.subscribers = new Map();
    this.lastLoggedPrice = 0;
  }

  initialize() {
    logger.info('Initializing market data manager...');
    
    // Subscribe to price updates from LN Markets
    this.lnMarketsClient.on('priceUpdate', (data) => {
      this.handlePriceUpdate(data);
    });

    // Start collecting price history
    this.startPriceCollection();

    logger.gooseAction('MARKET_DATA_INITIALIZED', {
      source: 'LN Markets WebSocket'
    });
  }

  handlePriceUpdate(data) {
    const priceData = {
      price: data.index || data.price,
      timestamp: new Date().toISOString(),
      volume: data.volume || 0,
      bid: data.bid,
      ask: data.ask,
      spread: data.ask - data.bid
    };

    this.currentPrice = priceData.price;
    this.priceHistory.push(priceData);

    // Maintain history length
    if (this.priceHistory.length > this.maxHistoryLength) {
      this.priceHistory.shift();
    }

    // Emit price update to all listeners
    this.emit('price', priceData);

    // Notify subscribers
    this.notifySubscribers('price', priceData);

    logger.debug('Price update', { 
      price: priceData.price,
      spread: priceData.spread 
    });
  }

  startPriceCollection() {
    // Use live CoinGecko prices instead of simulation
    this.startLivePriceCollection();
    logger.info('Price collection started');
  }

  async startLivePriceCollection() {
    try {
      // Get initial price
      await this.fetchLivePrice();
      
      // Update every 30 seconds to avoid rate limits
      setInterval(async () => {
        await this.fetchLivePrice();
      }, 30000);
      
      logger.info('🔴 LIVE Bitcoin price feed started via CoinGecko');
    } catch (error) {
      logger.error('Failed to start live prices, falling back to simulation', error);
      this.simulatePriceData();
    }
  }

  async fetchLivePrice() {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true');
      
      const bitcoinData = response.data.bitcoin;
      const currentPrice = bitcoinData.usd;
      const change24h = bitcoinData.usd_24h_change;
      
      const priceData = {
        price: currentPrice,
        timestamp: new Date().toISOString(),
        volume: Math.random() * 1000000 + 500000, // Simulated volume
        bid: currentPrice - 10,
        ask: currentPrice + 10,
        spread: 20,
        change24h: change24h
      };

      this.handlePriceUpdate(priceData);
      
      // Log every few updates for visibility
      if (Math.random() < 0.3) {
        const trend = change24h > 0 ? '📈' : '📉';
        logger.info(`🔴 LIVE Bitcoin: $${currentPrice.toLocaleString()} ${trend} (${change24h.toFixed(2)}% 24h)`, {
          price: currentPrice,
          change24h: change24h
        });
      }
      
    } catch (error) {
      if (error.response && error.response.status === 429) {
        logger.warn('Rate limited by CoinGecko, falling back to simulation');
        this.simulatePriceData();
      } else {
        logger.error('Failed to fetch live price from CoinGecko', error);
      }
    }
  }

  simulatePriceData() {
    // Start with realistic current Bitcoin price around $117,750
    let currentPrice = 117750 + (Math.random() * 5000 - 2500);
    
    const generatePriceData = () => {
      // Simulate more volatile price movements for demo
      const change = (Math.random() - 0.5) * 2000; // +/- $1000 max change
      currentPrice += change;
      currentPrice = Math.max(110000, Math.min(125000, currentPrice)); // Keep within realistic current bounds
      
      const priceData = {
        price: currentPrice,
        timestamp: new Date().toISOString(),
        volume: Math.random() * 1000000 + 500000,
        bid: currentPrice - 10,
        ask: currentPrice + 10,
        spread: 20
      };

      this.handlePriceUpdate(priceData);
      
      // Log price updates for visibility
      if (Math.random() < 0.3) { // Log ~30% of price updates
        logger.info(`📊 Bitcoin Price: $${currentPrice.toFixed(2)}`, {
          price: currentPrice,
          trend: currentPrice > this.lastLoggedPrice ? '📈' : '📉'
        });
        this.lastLoggedPrice = currentPrice;
      }
    };

    // Generate initial price history
    for (let i = 0; i < 50; i++) {
      generatePriceData();
    }

    // Continue generating price updates every 5 seconds
    setInterval(generatePriceData, 5000);
    
    logger.info('Simulated price data started', { currentPrice });
  }

  getLatestPrice() {
    return this.currentPrice;
  }

  getPriceHistory(periods = 100) {
    const start = Math.max(0, this.priceHistory.length - periods);
    return this.priceHistory.slice(start);
  }

  calculateSMA(period) {
    if (this.priceHistory.length < period) {
      return null;
    }

    const prices = this.priceHistory
      .slice(-period)
      .map(p => p.price);
    
    const sum = prices.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  calculateEMA(period) {
    if (this.priceHistory.length < period) {
      return null;
    }

    const prices = this.priceHistory.map(p => p.price);
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  calculateRSI(period = 14) {
    if (this.priceHistory.length < period + 1) {
      return null;
    }

    const prices = this.priceHistory.map(p => p.price);
    const changes = [];
    
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? Math.abs(c) : 0);

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  calculateBollingerBands(period = 20, stdDev = 2) {
    if (this.priceHistory.length < period) {
      return null;
    }

    const sma = this.calculateSMA(period);
    const prices = this.priceHistory.slice(-period).map(p => p.price);
    
    const squaredDiffs = prices.map(price => Math.pow(price - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const standardDeviation = Math.sqrt(variance);

    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev),
      standardDeviation
    };
  }

  getVolatility(period = 20) {
    if (this.priceHistory.length < period) {
      return null;
    }

    const returns = [];
    const prices = this.priceHistory.slice(-period - 1).map(p => p.price);

    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;

    return Math.sqrt(variance) * Math.sqrt(252); // Annualized volatility
  }

  getTrend(shortPeriod = 10, longPeriod = 30) {
    const shortSMA = this.calculateSMA(shortPeriod);
    const longSMA = this.calculateSMA(longPeriod);

    if (!shortSMA || !longSMA) {
      return 'NEUTRAL';
    }

    const difference = ((shortSMA - longSMA) / longSMA) * 100;

    if (difference > 1) return 'BULLISH';
    if (difference < -1) return 'BEARISH';
    return 'NEUTRAL';
  }

  subscribe(eventType, callback) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType).add(callback);
  }

  unsubscribe(eventType, callback) {
    if (this.subscribers.has(eventType)) {
      this.subscribers.get(eventType).delete(callback);
    }
  }

  notifySubscribers(eventType, data) {
    if (this.subscribers.has(eventType)) {
      this.subscribers.get(eventType).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error('Subscriber callback error', error);
        }
      });
    }
  }

  getMarketMetrics() {
    return {
      currentPrice: this.currentPrice,
      sma10: this.calculateSMA(10),
      sma30: this.calculateSMA(30),
      ema10: this.calculateEMA(10),
      ema30: this.calculateEMA(30),
      rsi: this.calculateRSI(),
      bollingerBands: this.calculateBollingerBands(),
      volatility: this.getVolatility(),
      trend: this.getTrend(),
      priceHistoryLength: this.priceHistory.length
    };
  }
}

module.exports = MarketDataManager;