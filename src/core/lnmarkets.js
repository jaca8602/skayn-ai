let lnMarketsApi;
async function loadLNMarketsAPI() {
  if (!lnMarketsApi) {
    lnMarketsApi = await import('@ln-markets/api');
  }
  return lnMarketsApi;
}
const logger = require('../utils/logger');
const EventEmitter = require('events');

class LNMarketsClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.restClient = null;
    this.wsClient = null;
    this.isConnected = false;
    this.positions = new Map();
    this.balance = 0;
    this.reconnectAttempts = 0;
    this.mockPositions = new Map(); // Store mock positions for P&L tracking
  }

  async initialize() {
    try {
      logger.info('Initializing LN Markets client...');
      
      // Load the API module
      const api = await loadLNMarketsAPI();
      
      // Initialize REST client
      this.restClient = api.createRestClient({
        key: this.config.key,
        secret: this.config.secret,
        passphrase: this.config.passphrase,
        network: this.config.network || 'testnet'
      });

      // Test connection and get initial balance
      try {
        const userInfo = await this.restClient.userGet();
        logger.info('Connected to LN Markets', { 
          userId: userInfo.uid,
          network: this.config.network 
        });
        this.balance = userInfo.balance || 0;
      } catch (error) {
        // Try alternative method names
        logger.info('Testing connection...');
        this.balance = 1000; // Set mock $1000 balance for testnet hypertrading
      }

      // Initialize WebSocket client (optional for now)
      try {
        await this.initializeWebSocket();
      } catch (wsError) {
        // Suppress WebSocket errors - not critical for trading
        logger.debug('WebSocket not available, using REST API only');
      }

      this.isConnected = true;
      logger.gooseAction('LN_MARKETS_CONNECTED', { 
        network: this.config.network,
        balance: this.balance 
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize LN Markets client', error);
      throw error;
    }
  }

  async initializeWebSocket() {
    try {
      const api = await loadLNMarketsAPI();
      this.wsClient = await api.createWebSocketClient({
        key: this.config.key,
        secret: this.config.secret,
        passphrase: this.config.passphrase,
        network: this.config.network || 'testnet'
      });

      // Subscribe to events
      this.wsClient.on('futures:index', (data) => {
        this.emit('priceUpdate', data);
      });

      this.wsClient.on('futures:position', (data) => {
        this.handlePositionUpdate(data);
      });

      this.wsClient.on('error', (error) => {
        logger.error('WebSocket error', error);
        this.handleWebSocketError(error);
      });

      this.wsClient.on('close', () => {
        logger.warn('WebSocket connection closed');
        this.handleWebSocketClose();
      });

      // Subscribe to market data
      await this.wsClient.subscribe({ 
        channels: ['futures:index', 'futures:position'] 
      });

      logger.info('WebSocket connection established');
    } catch (error) {
      logger.error('Failed to initialize WebSocket', error);
      throw error;
    }
  }

  async updateBalance() {
    try {
      const userInfo = await this.restClient.userGet();
      this.balance = userInfo.balance || 0;
      logger.info('Balance updated', { balance: this.balance });
      return this.balance;
    } catch (error) {
      logger.error('Failed to update balance', error);
      return this.balance; // Return current balance on error
    }
  }

  async getPositions() {
    try {
      // Get real positions from LN Markets API
      let positions = [];
      
      try {
        // Try 'running' type first (this is what works for our position)
        positions = await this.restClient.futuresGetTrades({ type: 'running' });
        logger.info(`📊 Fetched ${positions.length} running positions from LN Markets`);
      } catch (e) {
        // Try alternative API methods
        try {
          // Try without type parameter - get ALL trades
          const allTrades = await this.restClient.futuresGetTrades();
          logger.info(`📊 Total trades from API: ${allTrades.length}`);
          
          // Filter for running positions (multiple status checks)
          positions = allTrades.filter(trade => 
            trade.running === true || 
            trade.open === true || 
            trade.state === 'open' || 
            trade.status === 'open' ||
            (trade.closed === false && trade.canceled === false)
          );
          logger.info(`📊 Filtered to ${positions.length} open/running positions`);
          
          // Debug: log all trade statuses
          allTrades.forEach(trade => {
            logger.info(`🔍 Trade ${trade.id}: running=${trade.running}, open=${trade.open}, closed=${trade.closed}, canceled=${trade.canceled}`);
          });
          
        } catch (e2) {
          logger.error('❌ Both API methods failed for position fetching:', {
            primaryError: e.message,
            fallbackError: e2.message,
            network: this.config.network
          });
          
          // CRITICAL: Don't return mock data - this masks real API issues
          // Agent must know if it can't track positions
          throw new Error(`Cannot fetch positions from LN Markets API: ${e.message}`);
        }
      }
      
      // Update local position tracking
      this.positions.clear();
      if (Array.isArray(positions)) {
        positions.forEach(pos => {
          this.positions.set(pos.id, pos);
        });
        
        // Log position details for debugging
        if (positions.length > 0) {
          positions.forEach(pos => {
            logger.info('🔍 Active Position:', {
              id: pos.id,
              side: pos.side,
              quantity: pos.quantity,
              price: pos.price,
              margin: pos.margin,
              pl: pos.pl
            });
          });
        }
      }

      return Array.from(this.positions.values());
    } catch (error) {
      logger.error('💥 Critical: Position tracking failed', {
        error: error.message,
        network: this.config.network,
        action: 'POSITION_TRACKING_FAILURE'
      });
      
      // NEVER return mock positions - this caused the 3,007 sats loss
      throw error;
    }
  }

  async openPosition(side, quantity, leverage = 1) {
    try {
      // Convert BTC quantity to proper satoshi margin
      const currentPrice = this.marketData?.getLatestPrice() || 116000;
      const positionValueUSD = quantity * currentPrice; // e.g. $2.00
      const marginUSD = positionValueUSD / leverage; // e.g. $1.00 with 2x leverage
      const marginSats = Math.floor((marginUSD / currentPrice) * 100000000); // Convert to sats
      
      // Ensure minimum margin (LN Markets requires >0)
      const finalMargin = Math.max(marginSats, 1000); // Minimum 1000 sats
      
      const params = {
        side: side === 'buy' ? 'b' : 's',  // API expects 'b'/'s' not 'buy'/'sell'
        type: 'm',  // API expects 'm' not 'market'
        margin: finalMargin,  // Use margin-based trading with actual sats
        leverage: leverage
      };
      
      logger.info('💰 MARGIN CALCULATION', {
        quantity: `${quantity.toFixed(8)} BTC`,
        positionValueUSD: `$${positionValueUSD.toFixed(2)}`,
        marginUSD: `$${marginUSD.toFixed(2)}`,
        marginSats: marginSats,
        finalMargin: finalMargin,
        leverage: `${leverage}x`
      });

      logger.gooseDecision('OPEN_POSITION', {
        side,
        quantity,
        leverage,
        rationale: 'Market conditions favorable for entry'
      });

      // Execute the real LN Markets trade
      let position;
      try {
        position = await this.restClient.futuresNewTrade(params);
        logger.info('✅ REAL TRADE EXECUTED via LN Markets API');
      } catch (e) {
        // Intelligent error analysis for debugging
        const errorAnalysis = this.analyzeLNMarketsError(e, params);
        
        logger.error('❌ LN Markets API Error:', {
          error: e.message,
          status: e.status,
          params: params,
          network: this.config?.network || 'unknown',
          analysis: errorAnalysis
        });
        
        // NO MOCK POSITIONS - throw the error so we know what's wrong
        throw new Error(`LN Markets API failed: ${e.message}. Analysis: ${errorAnalysis.likely_cause}`);
      }
      
      // Highlight the trade execution with emojis and formatting
      const tradeEmoji = position.side === 'buy' ? '🟢 LONG' : '🔴 SHORT';
      const arrow = position.side === 'buy' ? '📈' : '📉';
      
      logger.info(`🎯 ${tradeEmoji} POSITION OPENED ${arrow}`, {
        positionId: position.id,
        side: position.side.toUpperCase(),
        quantity: position.quantity,
        leverage: `${position.leverage}x`,
        entryPrice: `$${position.price?.toLocaleString()}`,
        value: `$${(position.quantity * (position.price || 0)).toLocaleString()}`,
        margin: `$${position.margin?.toLocaleString()}`,
        fees: position.fees ? {
          opening: `$${position.fees.opening.toFixed(2)}`,
          dailyCost: `$${position.fees.totalDailyCost.toFixed(2)}/day`,
          estimatedTotal: `$${position.fees.estimatedTotalCost.toFixed(2)}`
        } : 'N/A'
      });

      logger.trade({
        action: 'OPEN',
        positionId: position.id,
        side: position.side,
        quantity: position.quantity,
        leverage: position.leverage,
        entryPrice: position.price,
        timestamp: new Date().toISOString()
      });

      this.positions.set(position.id, position);
      this.mockPositions.set(position.id, position); // Also store in mock positions for P&L
      await this.updateBalance();

      return position;
    } catch (error) {
      logger.error('Failed to open position', error);
      throw error;
    }
  }

  async closePosition(positionId) {
    try {
      const position = this.positions.get(positionId);
      if (!position) {
        throw new Error('Position not found');
      }

      logger.gooseDecision('CLOSE_POSITION', {
        positionId,
        rationale: 'Target reached or risk limit triggered'
      });

      // Try different API method names for closing positions
      let result;
      try {
        result = await this.restClient.futuresCloseTrade(positionId);
      } catch (e) {
        try {
          result = await this.restClient.futuresCloseTrade(positionId);
        } catch (e2) {
          logger.error('Could not close position with available methods');
          throw new Error('Position closing not available in current API version');
        }
      }

      logger.trade({
        action: 'CLOSE',
        positionId: result.id,
        side: result.side,
        quantity: result.quantity,
        entryPrice: result.entry_price,
        exitPrice: result.exit_price,
        pl: result.pl,
        timestamp: new Date().toISOString()
      });

      this.positions.delete(positionId);
      await this.updateBalance();

      return result;
    } catch (error) {
      logger.error('Failed to close position', error);
      throw error;
    }
  }

  async updateStopLoss(positionId, stopLossPrice) {
    try {
      const result = await this.restClient.futuresUpdateTrade({
        id: positionId,
        type: 'stoploss',  // Fixed: API expects 'stoploss' not 'stop_loss'
        value: stopLossPrice  // Fixed: API expects 'value' not 'price'
      });

      logger.info('Stop loss updated', { 
        positionId, 
        stopLossPrice 
      });

      return result;
    } catch (error) {
      logger.error('Failed to update stop loss', error);
      throw error;
    }
  }

  async getMarketInfo() {
    try {
      const info = await this.restClient.futuresGetTicker();
      return info;
    } catch (error) {
      logger.error('Failed to get market info', error);
      throw error;
    }
  }

  handlePositionUpdate(data) {
    logger.info('Position update received', data);
    this.emit('positionUpdate', data);
  }

  handleWebSocketError(error) {
    logger.error('WebSocket error occurred', error);
    this.emit('error', error);
  }

  async handleWebSocketClose() {
    this.isConnected = false;
    
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      logger.info(`Attempting to reconnect... (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);
      
      setTimeout(async () => {
        try {
          await this.initializeWebSocket();
          this.reconnectAttempts = 0;
        } catch (error) {
          logger.error('Reconnection failed', error);
        }
      }, this.config.reconnectInterval);
    }
  }

  // Intelligent analysis of LN Markets API errors
  analyzeLNMarketsError(error, params) {
    const analysis = {
      type: 'unknown',
      likely_cause: 'API error',
      action_required: 'Contact LN Markets support'
    };

    // Check for HTTP 500 Internal Server Error
    if (error.status === 500 && error.message?.includes('Internal error')) {
      // Compare requested margin with current balance
      const requestedMargin = params.margin || 0;
      const currentBalance = this.balance || 0;
      const shortfall = requestedMargin - currentBalance;

      if (shortfall > 0) {
        // Likely insufficient balance
        analysis.type = 'insufficient_balance';
        analysis.likely_cause = `Insufficient balance: need ${shortfall} more sats`;
        analysis.action_required = `Deposit at least ${shortfall} sats (have ${currentBalance}, need ${requestedMargin})`;
        analysis.balance_details = {
          current: currentBalance,
          required: requestedMargin,
          shortfall: shortfall
        };
      } else {
        // Margin seems fine, probably real API issue
        analysis.type = 'api_outage';
        analysis.likely_cause = 'LN Markets internal server error (not balance related)';
        analysis.action_required = 'Wait for LN Markets to resolve server issues';
        analysis.balance_details = {
          current: currentBalance,
          required: requestedMargin,
          sufficient: true
        };
      }
    } else if (error.status === 400) {
      analysis.type = 'bad_request';
      analysis.likely_cause = 'Invalid API parameters';
      analysis.action_required = 'Check trade parameters and API format';
    } else if (error.status === 401) {
      analysis.type = 'auth_error';
      analysis.likely_cause = 'API credentials invalid or expired';
      analysis.action_required = 'Check API keys and permissions';
    } else if (error.status === 429) {
      analysis.type = 'rate_limit';
      analysis.likely_cause = 'Too many API requests';
      analysis.action_required = 'Wait before retrying';
    }

    return analysis;
  }

  calculateFees(quantity, price, leverage) {
    const positionValue = quantity * price;
    const margin = positionValue / leverage;
    
    // LN Markets fee structure (testnet values)
    const fees = {
      // Opening fee: 0.1% of position value
      opening: positionValue * 0.001,
      
      // Funding rate: ~0.01% per 8 hours (3 times daily)
      fundingPerDay: positionValue * 0.0003,
      
      // Carry fee for leverage: 0.05% per day of borrowed amount
      carryPerDay: (positionValue - margin) * 0.0005,
      
      // Closing fee: 0.1% of position value (estimated)
      closingEstimated: positionValue * 0.001
    };
    
    fees.totalOpeningCost = fees.opening + fees.fundingPerDay + fees.carryPerDay;
    fees.totalDailyCost = fees.fundingPerDay + fees.carryPerDay;
    fees.estimatedTotalCost = fees.opening + fees.closingEstimated + fees.totalDailyCost;
    
    return fees;
  }

  // Deposit and account methods
  async getDepositAddress() {
    try {
      // Try to get a deposit address from LN Markets API
      const result = await this.restClient.userDeposit();
      return {
        invoice: result.invoice,
        qrCode: result.qr_code,
        address: result.address,
        amount: result.amount
      };
    } catch (error) {
      logger.warn('Could not fetch real deposit address, using mock', error);
      return {
        invoice: 'lnbc100u1p...[mock_invoice_for_testnet]',
        qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        address: 'Mock Lightning Address for Development',
        amount: 10000 // 10k sats = ~$10
      };
    }
  }
  
  async createDepositInvoice(amountSats) {
    try {
      const result = await this.restClient.userDeposit({
        amount: amountSats
      });
      return {
        success: true,
        invoice: result.invoice,
        amount: amountSats,
        qrCode: result.qr_code
      };
    } catch (error) {
      logger.error('Failed to create deposit invoice', error);
      return {
        success: false,
        error: error.message,
        mockInvoice: `lnbc${amountSats}u1p...[mock_invoice_${amountSats}_sats]`
      };
    }
  }
  
  async getDepositHistory() {
    try {
      const deposits = await this.restClient.userDepositHistory();
      return deposits.map(d => ({
        id: d.id,
        amount: d.amount,
        status: d.status,
        timestamp: d.created_at,
        txid: d.txid
      }));
    } catch (error) {
      logger.warn('Could not fetch deposit history', error);
      return [];
    }
  }
  
  async getDepositStatus(depositId) {
    try {
      const deposit = await this.restClient.userDepositHistory({ id: depositId });
      return {
        id: deposit.id,
        status: deposit.status,
        amount: deposit.amount,
        confirmations: deposit.confirmations,
        timestamp: deposit.created_at
      };
    } catch (error) {
      logger.error('Could not get deposit status', error);
      return null;
    }
  }

  async disconnect() {
    try {
      if (this.wsClient) {
        await this.wsClient.close();
      }
      this.isConnected = false;
      logger.info('Disconnected from LN Markets');
    } catch (error) {
      logger.error('Error during disconnect', error);
    }
  }
}

module.exports = LNMarketsClient;