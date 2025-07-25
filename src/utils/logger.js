const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.GOOSE_LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'goose-trading-agent' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log') 
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'trades.log'),
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(info => {
          if (info.trade) {
            return JSON.stringify({
              timestamp: info.timestamp,
              level: info.level,
              trade: info.trade
            });
          }
          return '';
        })
      )
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Goose-specific logging methods
logger.gooseAction = (action, details) => {
  logger.info(`[GOOSE ACTION] ${action}`, { gooseAction: action, ...details });
};

logger.gooseDecision = (decision, rationale) => {
  logger.info(`[GOOSE DECISION] ${decision}`, { gooseDecision: decision, rationale });
};

logger.trade = (tradeData) => {
  logger.info('Trade executed', { trade: tradeData });
};

module.exports = logger;