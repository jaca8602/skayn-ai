#!/usr/bin/env node

/**
 * Skayn Bitcoin Trading Extension for Block's Goose Framework
 * Integrates autonomous Bitcoin trading capabilities via Lightning Network
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') });

class BitcoinTradingServer {
  constructor() {
    this.server = new Server(
      {
        name: 'skayn-bitcoin-trading',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // List all available trading tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'start_trading',
            description: 'Start autonomous Bitcoin trading on LN Markets mainnet',
            inputSchema: {
              type: 'object',
              properties: {
                mode: {
                  type: 'string',
                  enum: ['autonomous', 'manual'],
                  default: 'autonomous',
                  description: 'Trading mode'
                }
              }
            }
          },
          {
            name: 'stop_trading',
            description: 'Stop trading agent and optionally close all positions',
            inputSchema: {
              type: 'object',
              properties: {
                emergency: {
                  type: 'boolean',
                  default: false,
                  description: 'Emergency stop (closes all positions)'
                }
              }
            }
          },
          {
            name: 'check_positions',
            description: 'Check current Bitcoin trading positions and P&L',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'get_trading_status',
            description: 'Get comprehensive trading agent status',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'check_balance',
            description: 'Check Lightning Network balance and trading eligibility',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'create_deposit_invoice',
            description: 'Create Lightning Network deposit invoice',
            inputSchema: {
              type: 'object',
              properties: {
                amount_sats: {
                  type: 'number',
                  default: 50000,
                  description: 'Amount in satoshis to deposit'
                }
              }
            }
          },
          {
            name: 'switch_strategy',
            description: 'Switch between basic and enhanced trading strategies',
            inputSchema: {
              type: 'object',
              properties: {
                strategy: {
                  type: 'string',
                  enum: ['basic', 'enhanced'],
                  description: 'Trading strategy to use'
                }
              }
            }
          },
          {
            name: 'force_trade_decision',
            description: 'Force the agent to make an immediate trading decision',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'start_trading':
            return await this.executeTradingCommand('start');
          
          case 'stop_trading':
            return await this.executeTradingCommand(args?.emergency ? 'panic' : 'stop');
          
          case 'check_positions':
            return await this.executeTradingCommand('positions');
          
          case 'get_trading_status':
            return await this.executeTradingCommand('status');
          
          case 'check_balance':
            return await this.executeTradingCommand('balance');
          
          case 'create_deposit_invoice':
            const amount = args?.amount_sats || 50000;
            return await this.executeTradingCommand('invoice', [amount.toString()]);
          
          case 'switch_strategy':
            const strategy = args?.strategy || 'enhanced';
            return await this.executeTradingCommand('strategy', [strategy]);
          
          case 'force_trade_decision':
            return await this.executeTradingCommand('force');
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async executeTradingCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      const tradingAgentPath = join(dirname(fileURLToPath(import.meta.url)), '../../skayn');
      
      const child = spawn(tradingAgentPath, [command, ...args], {
        cwd: join(dirname(fileURLToPath(import.meta.url)), '../..'),
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          try {
            // Try to parse as JSON first
            const result = JSON.parse(stdout);
            resolve({
              content: [
                {
                  type: 'text',
                  text: `✅ **${command.toUpperCase()} Command Executed Successfully**\\n\\n` +
                        `**Result:** ${JSON.stringify(result.result || result, null, 2)}\\n\\n` +
                        `**Timestamp:** ${result.timestamp || new Date().toISOString()}\\n\\n` +
                        `**Command:** \`./skayn ${command} ${args.join(' ')}\``
                }
              ]
            });
          } catch (e) {
            // If not JSON, return raw output
            resolve({
              content: [
                {
                  type: 'text',
                  text: `✅ **${command.toUpperCase()} Command Executed**\\n\\n\`\`\`\\n${stdout}\`\`\``
                }
              ]
            });
          }
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute command: ${error.message}`));
      });
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Skayn Bitcoin Trading Extension for Goose started');
  }
}

const server = new BitcoinTradingServer();
server.run().catch(console.error);