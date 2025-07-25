const axios = require('axios');
const logger = require('./logger');

class PriceService {
  constructor() {
    this.cache = null;
    this.cacheTime = 0;
    this.cacheMaxAge = 90000; // Cache for 90 seconds (longer to be safe)
    this.lastApiCall = 0;
    this.minApiInterval = 90000; // Minimum 90 seconds between API calls
    this.isRateLimited = false;
    this.backoffMultiplier = 1;
    this.subscribers = new Set();
    this.apiCallCount = 0;
    this.apiCallHistory = []; // Track API calls for rate limiting
    this.maxCallsPerHour = 50; // Conservative limit
  }

  async getBitcoinPrice() {
    // Check cache first
    const now = Date.now();
    if (this.cache && (now - this.cacheTime) < this.cacheMaxAge) {
      logger.debug('Using cached Bitcoin price', { price: this.cache.price, cacheAgeMs: now - this.cacheTime });
      return this.cache.price;
    }

    // Advanced rate limiting check
    if (!this.canMakeApiCall(now)) {
      if (this.cache) {
        logger.warn('🛡️ Rate limit protection active - using cached price', {
          price: this.cache.price,
          cacheAge: Math.round((now - this.cacheTime) / 1000) + 's',
          nextCallIn: Math.round((this.getNextAllowedCallTime() - now) / 1000) + 's'
        });
        return this.cache.price;
      } else {
        logger.error('🚨 Rate limited and no cached price available');
        throw new Error('Rate limited and no cached price available');
      }
    }

    try {
      // Try Coinbase API first (much more generous than CoinGecko)
      logger.info('🔄 Fetching Bitcoin price from Coinbase API...');
      
      const response = await axios.get('https://api.coinbase.com/v2/prices/spot?currency=USD', {
        timeout: 10000,
        headers: {
          'User-Agent': 'Skayn.ai-Trading-Agent/1.0'
        }
      });

      if (response.data && response.data.data && response.data.data.amount) {
        const price = parseFloat(response.data.data.amount);
        
        // Update cache with real data
        this.cache = {
          price: price,
          change24h: 0, // Coinbase spot doesn't provide 24h change
          timestamp: now,
          source: 'COINBASE'
        };
        this.cacheTime = now;
        this.recordApiCall(now);
        this.isRateLimited = false;
        this.backoffMultiplier = 1;
        
        // Notify subscribers
        this.notifySubscribers(this.cache);
        
        logger.info(`💰 Bitcoin Price (Coinbase): $${price.toFixed(2)}`, {
          price: price,
          source: 'COINBASE_API'
        });
        
        return price;
      } else {
        throw new Error('Invalid response format from Coinbase');
      }

    } catch (error) {
      logger.warn('Coinbase API failed, trying backup APIs', {
        error: error.message,
        status: error.response?.status
      });
      
      // Try backup APIs before giving up
      return this.tryBackupAPIs();
    }
  }

  async tryBackupAPIs() {

    // Try Kraken first
    try {
      logger.info('🔄 Trying Kraken API...');
      const response = await axios.get('https://api.kraken.com/0/public/Ticker?pair=XBTUSD', {
        timeout: 5000,
        headers: { 'User-Agent': 'Skayn.ai-Trading-Agent/1.0' }
      });

      if (response.data && response.data.result && response.data.result.XXBTZUSD) {
        const price = parseFloat(response.data.result.XXBTZUSD.c[0]);
        
        this.cache = {
          price: price,
          change24h: 0,
          timestamp: Date.now(),
          source: 'KRAKEN'
        };
        this.cacheTime = Date.now();
        this.recordApiCall(Date.now());
        
        this.notifySubscribers(this.cache);
        
        logger.info(`💰 Bitcoin Price (Kraken): $${price.toFixed(2)}`, {
          price: price,
          source: 'KRAKEN_API'
        });
        
        return price;
      }
    } catch (error) {
      logger.warn('Kraken API failed', { error: error.message });
    }

    // Try CoinGecko as last resort (despite rate limits)
    try {
      logger.info('🔄 Trying CoinGecko API (last resort)...');
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', {
        timeout: 10000,
        headers: { 'User-Agent': 'Skayn.ai-Trading-Agent/1.0' }
      });

      if (response.data && response.data.bitcoin && response.data.bitcoin.usd) {
        const price = parseFloat(response.data.bitcoin.usd);
        
        this.cache = {
          price: price,
          change24h: 0,
          timestamp: Date.now(),
          source: 'COINGECKO'
        };
        this.cacheTime = Date.now();
        this.recordApiCall(Date.now());
        
        this.notifySubscribers(this.cache);
        
        logger.warn(`💰 Bitcoin Price (CoinGecko - Last Resort): $${price.toFixed(2)}`, {
          price: price,
          source: 'COINGECKO_BACKUP',
          warning: 'Using CoinGecko due to other API failures - may hit rate limits'
        });
        
        return price;
      }
    } catch (error) {
      logger.warn('CoinGecko API also failed', { error: error.message });
    }

    // All APIs failed - this is critical
    const errorMsg = 'All Bitcoin price APIs failed (Coinbase, Kraken, CoinGecko). Cannot continue trading without real price data.';
    logger.error('🚨 CRITICAL: All price APIs failed', { 
      apis: ['Coinbase', 'Kraken', 'CoinGecko'],
      recommendation: 'Stop trading immediately'
    });
    
    throw new Error(errorMsg);
  }

  canMakeApiCall(now) {
    // Clean old calls from history (older than 1 hour)
    const oneHourAgo = now - (60 * 60 * 1000);
    this.apiCallHistory = this.apiCallHistory.filter(time => time > oneHourAgo);
    
    // Check if we're under the hourly limit
    if (this.apiCallHistory.length >= this.maxCallsPerHour) {
      return false;
    }
    
    // Check minimum interval between calls
    if (now - this.lastApiCall < this.minApiInterval) {
      return false;
    }
    
    return true;
  }

  getNextAllowedCallTime() {
    const intervalCheck = this.lastApiCall + this.minApiInterval;
    const hourlyCheck = this.apiCallHistory.length > 0 ? 
      this.apiCallHistory[0] + (60 * 60 * 1000) : 0;
    
    return Math.max(intervalCheck, hourlyCheck);
  }

  recordApiCall(now) {
    this.apiCallHistory.push(now);
    this.lastApiCall = now;
    this.apiCallCount++;
  }

  getSimulatedPrice() {
    if (!this.simulatedPrice) {
      // Start with last known real price if available, otherwise use realistic current price
      this.simulatedPrice = this.cache?.price || 115000 + (Math.random() * 10000);
    }
    
    // Simulate small realistic price movements
    const change = (Math.random() - 0.5) * 200; // +/- $100 max change
    this.simulatedPrice += change;
    this.simulatedPrice = Math.max(110000, Math.min(130000, this.simulatedPrice));
    
    // Update cache with simulated data
    this.cache = {
      price: this.simulatedPrice,
      change24h: (Math.random() - 0.5) * 5, // Random daily change %
      timestamp: Date.now(),
      source: 'SIMULATION'
    };
    this.cacheTime = Date.now();
    
    // Notify subscribers
    this.notifySubscribers(this.cache);
    
    logger.info(`💰 Bitcoin Price (Simulated): $${this.simulatedPrice.toFixed(2)}`, {
      price: this.simulatedPrice,
      source: 'SIMULATION_FALLBACK'
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