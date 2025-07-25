const logger = require('../utils/logger');
const config = require('../../config/trading.config');
const priceService = require('../utils/price-service');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

class DepositManager {
  constructor(lnMarketsClient) {
    this.lnMarketsClient = lnMarketsClient;
    this.config = config;
    // Denominate in satoshis for proper Bitcoin behavior
    this.minHypertradingSats = process.env.MIN_BALANCE_SATS ? parseInt(process.env.MIN_BALANCE_SATS) : 1000; // Allow micro testing 
    this.maxHypertradingSats = 1000000; // 1M sats (~$500-1000) for safety
    this.lowBalanceThresholdSats = 20000; // 20k sats warning (~$10-20)
  }

  async getAccountBalance() {
    try {
      // Use the balance property from LN Markets client
      const balanceSats = this.lnMarketsClient.balance || 0;
      const btcPrice = await this.getBitcoinPrice();
      
      return {
        balanceSats,
        balanceUSD: this.satsToUSD(balanceSats, btcPrice),
        balanceBTC: balanceSats / 100000000, // Convert to BTC
        availableMargin: 0, // Will be implemented when API method is available
        usedMargin: 0,
        totalPL: 0,
        btcPrice
      };
    } catch (error) {
      logger.error('Failed to get account balance', error);
      return { 
        balanceSats: 0, 
        balanceUSD: 0,
        balanceBTC: 0,
        availableMargin: 0, 
        usedMargin: 0, 
        totalPL: 0,
        btcPrice: 100000 // Default BTC price
      };
    }
  }

  async getBitcoinPrice() {
    // Use centralized price service to avoid rate limiting
    return await priceService.getBitcoinPrice();
  }

  satsToUSD(sats, btcPrice) {
    return (sats / 100000000) * btcPrice;
  }

  usdToSats(usd, btcPrice) {
    return Math.floor((usd / btcPrice) * 100000000);
  }

  async checkHypertradingEligibility() {
    // TESTNET MODE: Bypass deposit requirements for testing
    if (process.env.NODE_ENV === 'development' || this.lnMarketsClient.config?.network === 'testnet') {
      logger.info('🧪 TESTNET MODE: Bypassing deposit requirements for testing');
      return {
        eligible: true,
        balanceSats: 100000, // Mock 100k sats for testing
        balanceUSD: '125.00', // Mock $125 USD
        balanceBTC: '0.00100000',
        reason: 'Testnet mode - deposit requirements bypassed',
        actions: [],
        safetyLevel: 'OPTIMAL'
      };
    }

    const balanceInfo = await this.getAccountBalance();
    const balanceSats = balanceInfo.balanceSats;
    const balanceUSD = balanceInfo.balanceUSD;

    const status = {
      eligible: false,
      balanceSats,
      balanceUSD: balanceUSD.toFixed(2),
      balanceBTC: balanceInfo.balanceBTC.toFixed(8),
      reason: '',
      actions: [],
      safetyLevel: this.calculateSafetyLevel(balanceSats)
    };

    // Check minimum balance for hypertrading (in sats)
    if (balanceSats < this.minHypertradingSats) {
      const neededSats = this.minHypertradingSats - balanceSats;
      const neededUSD = this.satsToUSD(neededSats, balanceInfo.btcPrice);
      
      status.reason = `Insufficient balance for hypertrading. Need minimum ${this.minHypertradingSats.toLocaleString()} sats (~$${neededUSD.toFixed(2)} more)`;
      status.actions.push({
        type: 'deposit',
        amountSats: neededSats,
        amountUSD: neededUSD.toFixed(2),
        method: 'lightning',
        instructions: 'Deposit Bitcoin via Lightning Network to enable hypertrading'
      });
      
      logger.warn('⚠️ Hypertrading disabled - insufficient balance', {
        currentSats: balanceSats,
        currentUSD: balanceUSD.toFixed(2),
        requiredSats: this.minHypertradingSats,
        neededSats: neededSats
      });
      
      return status;
    }

    // Check if balance is too high (safety measure)
    if (balanceSats > this.maxHypertradingSats) {
      status.eligible = true;
      status.reason = `High balance detected (${balanceSats.toLocaleString()} sats / $${balanceUSD.toFixed(2)}). Consider reducing for safer hypertrading.`;
      status.actions.push({
        type: 'warning',
        message: 'Consider withdrawing excess funds for responsible trading',
        safeAmountSats: this.maxHypertradingSats,
        safeAmountUSD: this.satsToUSD(this.maxHypertradingSats, balanceInfo.btcPrice).toFixed(2)
      });
      
      logger.warn('⚠️ High balance detected', {
        currentSats: balanceSats,
        recommendedMaxSats: this.maxHypertradingSats
      });
    } else {
      status.eligible = true;
      status.reason = `Balance ${balanceSats.toLocaleString()} sats ($${balanceUSD.toFixed(2)}) is optimal for hypertrading`;
    }

    // Low balance warning
    if (balanceSats < this.lowBalanceThresholdSats && balanceSats >= this.minHypertradingSats) {
      const maxPositionSats = this.usdToSats(this.config.trading.maxPositionSize, balanceInfo.btcPrice);
      status.actions.push({
        type: 'low_balance_warning',
        message: 'Low balance - consider depositing more for extended trading',
        remainingTrades: Math.floor(balanceSats / maxPositionSats)
      });
    }

    logger.info('⚡ Hypertrading eligibility check', status);
    return status;
  }

  calculateSafetyLevel(balanceSats) {
    if (balanceSats < this.minHypertradingSats) return 'INSUFFICIENT';
    if (balanceSats < this.lowBalanceThresholdSats) return 'LOW';
    if (balanceSats <= this.maxHypertradingSats) return 'OPTIMAL';
    return 'HIGH_RISK';
  }

  async generateDepositInstructions() {
    try {
      // Use real LN Markets API to get deposit info
      const depositInfo = await this.lnMarketsClient.getDepositAddress();
      
      // Display QR code in terminal if we have an invoice
      if (depositInfo?.invoice) {
        console.log('\n⚡ LIGHTNING DEPOSIT QR CODE ⚡\n');
        
        // Show ASCII QR in terminal
        qrcodeTerminal.generate(depositInfo.invoice, { small: true });
        
        // Also save as PNG file that can be scanned
        const qrPath = path.join(__dirname, '../../lightning-invoice.png');
        try {
          await QRCode.toFile(qrPath, depositInfo.invoice, {
            width: 300,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });
          console.log(`\n📱 Scannable QR saved: ${qrPath}`);
          console.log('💡 Open the PNG file to scan with your phone!\n');
        } catch (error) {
          logger.warn('Could not save QR code image:', error);
        }
        
        console.log('📋 Invoice:', depositInfo.invoice.substring(0, 40) + '...\n');
        
        // Calculate amount in USD if provided
        if (depositInfo.amount) {
          const btcPrice = await this.getBitcoinPrice();
          const amountUSD = this.satsToUSD(depositInfo.amount, btcPrice);
          console.log(`💰 Amount: ${depositInfo.amount.toLocaleString()} sats (~$${amountUSD.toFixed(2)})\n`);
        }
      }
      
      return {
        method: 'Lightning Network via LN Markets API',
        instructions: [
          '1. Use any Lightning wallet (Phoenix, Breez, Wallet of Satoshi, etc.)',
          '2. Scan the QR code above OR copy the Lightning invoice',
          '3. Send payment - deposits are instant with Lightning Network',
          `4. Minimum for hypertrading: ${this.minHypertradingSats.toLocaleString()} sats`,
          '5. Start trading immediately after deposit confirmation'
        ],
        lightningInvoice: depositInfo?.invoice || 'Use API to generate invoice',
        qrCode: depositInfo?.qrCode || `lightning:${depositInfo?.invoice}`,
        displayedQR: depositInfo?.invoice ? true : false,
        apiEndpoints: {
          deposit: 'POST /v2/user/deposit',
          getDeposits: 'GET /v2/user/deposits',
          getDepositStatus: 'GET /v2/user/deposit/:id'
        },
        limits: {
          minimumSats: 1000, // LN Markets actual minimum
          hypertradingSats: this.minHypertradingSats,
          maximumSats: this.maxHypertradingSats,
          dailyLimit: 'No limit specified'
        },
        fees: {
          deposit: 'Free via Lightning Network',
          trading: '0.1% per trade (maker/taker)',
          funding: '0.03% per day for open positions',
          withdrawal: 'Lightning network fees only (~1-3 sats)'
        },
        benefits: [
          '⚡ Instant deposits with Lightning Network',
          '🔄 Real-time balance updates via API',
          '💰 Lower minimums than traditional exchanges',
          '🤖 Direct integration with trading bot',
          '📱 Mobile wallet compatible'
        ],
        tips: [
          '💡 TIP: Take a photo of the QR code with your phone',
          '💡 TIP: Most wallets support scanning from camera roll',
          '💡 TIP: Invoice expires in 10 minutes typically'
        ]
      };
    } catch (error) {
      logger.error('Failed to generate deposit instructions', error);
      return {
        method: 'Lightning Network (Manual)',
        error: 'Could not fetch live deposit address',
        instructions: [
          'Visit https://testnet.lnmarkets.com/ to deposit manually',
          'Use Lightning Network for instant deposits',
          `Minimum: ${this.minHypertradingSats.toLocaleString()} sats for hypertrading`
        ]
      };
    }
  }

  async checkDailyLimits() {
    const balanceInfo = await this.getAccountBalance();
    const balance = balanceInfo.balance;
    
    // Calculate how many trades they can make today
    const maxDailyRisk = Math.min(
      this.config.risk.maxDailyLoss,
      balance * 0.1 // Max 10% of balance per day
    );
    
    const tradesRemaining = Math.floor(maxDailyRisk / (this.config.trading.maxPositionSize * 0.02));
    
    return {
      balance,
      maxDailyRisk,
      tradesRemaining,
      riskPerTrade: this.config.trading.maxPositionSize * 0.02,
      status: tradesRemaining > 0 ? 'ACTIVE' : 'DAILY_LIMIT_REACHED'
    };
  }

  async enforceResponsibleGambling() {
    const balanceInfo = await this.getAccountBalance();
    const balance = balanceInfo.balance;
    
    const warnings = [];
    
    // Check for addiction patterns
    const dailyTrades = await this.getDailyTradeCount();
    if (dailyTrades > 50) {
      warnings.push({
        type: 'EXCESSIVE_TRADING',
        message: 'High trading frequency detected. Consider taking a break.',
        recommendation: 'Limit trades to 20 per day for healthier habits'
      });
    }
    
    // Check for large losses
    const dailyPL = balanceInfo.totalPL;
    if (dailyPL < -balance * 0.2) {
      warnings.push({
        type: 'SIGNIFICANT_LOSSES',
        message: 'Large losses detected. Consider reducing position sizes.',
        recommendation: 'Stop trading for today and review strategy'
      });
    }
    
    // Check spending pattern
    if (balance > this.maxHypertradingBalance * 2) {
      warnings.push({
        type: 'HIGH_BALANCE',
        message: 'Large balance detected. Only risk what you can afford to lose.',
        recommendation: `Consider withdrawing excess above $${this.maxHypertradingBalance}`
      });
    }
    
    if (warnings.length > 0) {
      logger.warn('🚨 Responsible gambling check triggered', warnings);
    }
    
    return {
      warnings,
      safe: warnings.length === 0,
      emergencyStop: warnings.some(w => w.type === 'SIGNIFICANT_LOSSES')
    };
  }

  async getDailyTradeCount() {
    // This would connect to trade history
    // For now, return a mock value
    return 0;
  }

  async getDepositStatus() {
    const balance = await this.getAccountBalance();
    const eligibility = await this.checkHypertradingEligibility();
    const limits = await this.checkDailyLimits();
    const safety = await this.enforceResponsibleGambling();
    
    return {
      balance: balance.balance,
      eligible: eligibility.eligible,
      safetyLevel: eligibility.safetyLevel,
      tradesRemaining: limits.tradesRemaining,
      warnings: safety.warnings,
      readyToTrade: eligibility.eligible && !safety.emergencyStop,
      nextAction: eligibility.eligible ? 'Start hypertrading' : 'Deposit more funds'
    };
  }

  // Lightning Network specific deposit handling
  async handleLightningDeposit(invoice) {
    try {
      logger.info('⚡ Processing Lightning deposit', { invoice: invoice.slice(0, 20) + '...' });
      
      // LN Markets handles the actual deposit processing
      const result = await this.lnMarketsClient.deposit(invoice);
      
      logger.info('💰 Lightning deposit successful', {
        amount: result.amount,
        txid: result.txid
      });
      
      // Check if they're now eligible for hypertrading
      const eligibility = await this.checkHypertradingEligibility();
      
      return {
        success: true,
        amount: result.amount,
        newBalance: eligibility.balance,
        hypertradingEnabled: eligibility.eligible,
        message: eligibility.eligible ? 
          '🚀 Hypertrading enabled! Ready for micro-position trading.' :
          `Deposit successful. Need $${this.minHypertradingBalance - eligibility.balance} more for hypertrading.`
      };
      
    } catch (error) {
      logger.error('Lightning deposit failed', error);
      return {
        success: false,
        error: error.message,
        action: 'Please try again or contact support'
      };
    }
  }
}

module.exports = DepositManager;