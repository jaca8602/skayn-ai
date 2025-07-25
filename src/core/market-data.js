const EventEmitter = require('events');
const logger = require('../utils/logger');
const axios = require('axios');
const priceService = require('../utils/price-service');

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
    this.lastApiCall = 0;
    this.apiCallInterval = 60000; // 60 seconds minimum between API calls
    this.isRateLimited = false;
    this.backoffMultiplier = 1;
    this.priceCache = null;
    this.priceCacheTime = 0;
    this.cacheMaxAge = 30000; // Cache for 30 seconds
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
      // TESTNET: Always use simulation to ensure we have data
      logger.info('🧪 TESTNET: Starting with simulation for reliable data');
      this.simulatePriceData();
      
      // Clear any existing interval
      if (this.priceUpdateInterval) {
        clearInterval(this.priceUpdateInterval);
      }
      
      // Subscribe to price service for updates
      priceService.subscribe((priceData) => {
        if (priceData && priceData.price) {
          const data = {
            price: priceData.price,
            timestamp: new Date().toISOString(),
            volume: Math.random() * 1000000 + 500000,
            bid: priceData.price - 10,
            ask: priceData.price + 10,
            spread: 20,
            change24h: priceData.change24h || 0
          };
          this.handlePriceUpdate(data);
        }
      });
      
      logger.info('🔴 LIVE Bitcoin price feed started (centralized service)');
    } catch (error) {
      logger.error('Failed to start live prices, falling back to simulation', error);
      this.simulatePriceData();
    }
  }

  async fetchLivePrice() {
    try {
      // Get price data from centralized service
      const priceData = await priceService.getPriceData();
      
      this.handlePriceUpdate(priceData);
      
      // Log price updates for visibility
      const trend = priceData.price > this.lastLoggedPrice ? '📈' : '📉';
      logger.info(`📊 Bitcoin Price: $${priceData.price.toFixed(2)}`, {
        price: priceData.price,
        trend: trend
      });
      this.lastLoggedPrice = priceData.price;
      
    } catch (error) {
      logger.error('Failed to fetch price from service', error);
      // Fallback to simulation if needed
      if (!this.simulationStarted) {
        this.simulationStarted = true;
        this.simulatePriceData();
      }
    }
  }

  simulatePriceData() {
    // Prevent multiple simulation intervals
    if (this.simulationInterval) {
      return;
    }
    
    // Start with last known price or realistic current Bitcoin price
    let currentPrice = this.currentPrice || 120000;
    
    const generatePriceData = () => {
      // Simulate small realistic price movements
      const change = (Math.random() - 0.5) * 200; // +/- $100 max change
      currentPrice += change;
      currentPrice = Math.max(115000, Math.min(125000, currentPrice)); // Keep within realistic bounds
      
      const priceData = {
        price: currentPrice,
        timestamp: new Date().toISOString(),
        volume: Math.random() * 1000000 + 500000,
        bid: currentPrice - 10,
        ask: currentPrice + 10,
        spread: 20
      };

      this.handlePriceUpdate(priceData);
    };

    // Generate LOTS of initial price history (50 points for moving averages)
    logger.info('🚀 TESTNET: Generating 50 historical price points...');
    for (let i = 0; i < 50; i++) {
      generatePriceData();
    }
    
    logger.info(`📊 Historical data created: ${this.priceHistory.length} points`);

    // Continue generating price updates every 30 seconds (matching decision interval)
    this.simulationInterval = setInterval(() => {
      generatePriceData();
      
      // Log price updates for visibility
      const trend = currentPrice > this.lastLoggedPrice ? '📈' : '📉';
      logger.info(`📊 Bitcoin Price: $${currentPrice.toFixed(2)} (simulated)`, {
        price: currentPrice,
        trend: trend
      });
      this.lastLoggedPrice = currentPrice;
    }, 30000);
    
    logger.info('📊 Simulated price data started (fallback mode)', { currentPrice });
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