const axios = require('axios');
const logger = require('./logger');

class PriceService {
  constructor() {
    this.cache = null;
    this.cacheTime = 0;
    this.cacheMaxAge = 60000; // Cache for 60 seconds
    this.lastApiCall = 0;
    this.minApiInterval = 60000; // Minimum 60 seconds between API calls
    this.isRateLimited = false;
    this.backoffMultiplier = 1;
    this.subscribers = new Set();
  }

  async getBitcoinPrice() {
    // FUCK COINGECKO: Use simulated price for now
    logger.warn('🚫 Bypassing CoinGecko completely - using simulated prices');
    
    if (!this.simulatedPrice) {
      this.simulatedPrice = 120000 + (Math.random() * 10000 - 5000); // $115k-$125k range
    }
    
    // Simulate small price movements
    const change = (Math.random() - 0.5) * 500; // +/- $250 max change
    this.simulatedPrice += change;
    this.simulatedPrice = Math.max(115000, Math.min(125000, this.simulatedPrice));
    
    // Update cache with simulated data
    this.cache = {
      price: this.simulatedPrice,
      change24h: (Math.random() - 0.5) * 10, // Random daily change %
      timestamp: Date.now()
    };
    this.cacheTime = Date.now();
    
    // Notify subscribers
    this.notifySubscribers(this.cache);
    
    logger.info(`💰 Bitcoin Price (Simulated): $${this.simulatedPrice.toFixed(2)}`, {
      price: this.simulatedPrice,
      source: 'SIMULATION'
    });
    
    return this.simulatedPrice;
  }

  async getPriceData() {
    const price = await this.getBitcoinPrice();
    return {
      price: price,
      timestamp: new Date().toISOString(),
      volume: Math.random() * 1000000 + 500000,
      bid: price - 10,
      ask: price + 10,
      spread: 20,
      change24h: this.cache?.change24h || 0
    };
  }

  subscribe(callback) {
    this.subscribers.add(callback);
  }

  unsubscribe(callback) {
    this.subscribers.delete(callback);
  }

  notifySubscribers(data) {
    this.subscribers.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        logger.error('Price subscriber error:', error);
      }
    });
  }

  // Force refresh (use sparingly)
  async forceRefresh() {
    this.cache = null;
    this.cacheTime = 0;
    return await this.getBitcoinPrice();
  }
}

// Singleton instance
const priceService = new PriceService();

module.exports = priceService;