/**
 * Telegram Command Parser
 * Uses LLM to parse natural language trading commands
 */

export interface ParsedIntent {
  action: 'BUY' | 'SELL' | 'CLOSE' | 'STATUS' | 'HELP' | 'UNKNOWN';
  token?: string;
  amount?: number;
  amountType?: 'USDC' | 'PERCENTAGE'; // "$10" or "5%"
  confidence: number;
  reasoning?: string;
}

export class TelegramCommandParser {
  /**
   * Parse user command using LLM
   */
  async parseCommand(command: string): Promise<ParsedIntent> {
    const llmApiKey = process.env.LLM_API_KEY;
    
    if (!llmApiKey) {
      console.warn('[CommandParser] No LLM_API_KEY configured, using rule-based parsing');
      return this.parseCommandRuleBased(command);
    }

    try {
      // Use OpenAI/Anthropic to understand intent
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': llmApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `You are a trading assistant. Parse this user command into a structured format.

User command: "${command}"

Return ONLY valid JSON in this format:
{
  "action": "BUY" | "SELL" | "CLOSE" | "STATUS" | "HELP" | "UNKNOWN",
  "token": string | null,
  "amount": number | null,
  "amountType": "USDC" | "PERCENTAGE" | null,
  "confidence": 0.9,
  "reasoning": "Brief explanation"
}

Examples:
"Buy 10 USDC of WETH" → {"action":"BUY","token":"WETH","amount":10,"amountType":"USDC","confidence":1.0}
"Sell 50% of my ARB" → {"action":"SELL","token":"ARB","amount":50,"amountType":"PERCENTAGE","confidence":1.0}
"Buy 2 USDC of LINK" → {"action":"BUY","token":"LINK","amount":2,"amountType":"USDC","confidence":1.0}
"Close my PEPE position" → {"action":"CLOSE","token":"PEPE","amount":null,"amountType":null,"confidence":1.0}
"What's my status?" → {"action":"STATUS","token":null,"amount":null,"amountType":null,"confidence":1.0}

Supported tokens: WETH, WBTC, ARB, LINK, UNI, PENDLE, GMX, GRT, AAVE, CRV, LDO, PEPE, MATIC, SOL
Token should be uppercase ticker symbol from the list above, or null
Note: ETH → auto-convert to WETH, BTC → auto-convert to WBTC
Action must be exactly: BUY, SELL, CLOSE, STATUS, HELP, or UNKNOWN`
          }]
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.content[0].text;
      
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;

    } catch (error: any) {
      console.error('[CommandParser] LLM parsing error:', error.message);
      // Fallback to rule-based
      return this.parseCommandRuleBased(command);
    }
  }

  /**
   * Rule-based command parsing (fallback)
   */
  private parseCommandRuleBased(command: string): ParsedIntent {
    const lower = command.toLowerCase().trim();

    // STATUS command
    if (lower.includes('status') || lower.includes('positions') || lower.includes('show')) {
      return {
        action: 'STATUS',
        confidence: 0.9,
        reasoning: 'Status keyword detected',
      };
    }

    // HELP command
    if (lower.includes('help') || lower === '/start' || lower === '/help') {
      return {
        action: 'HELP',
        confidence: 1.0,
        reasoning: 'Help command',
      };
    }

    // CLOSE command
    // CLOSE/EXIT command (with typo tolerance)
    const closePatterns = [
      'close', 'exit', 'sell all', 'closme', 'clsoe', 'clos', 
      'cloze', 'closee', 'sell my'
    ];
    if (closePatterns.some(pattern => lower.includes(pattern))) {
      const token = this.extractToken(lower);
      return {
        action: 'CLOSE',
        token: token || undefined,
        confidence: token ? 0.85 : 0.7,
        reasoning: 'Close keyword detected',
      };
    }

    // BUY command
    if (lower.includes('buy') || lower.includes('long') || lower.includes('enter')) {
      const token = this.extractToken(lower);
      const amount = this.extractAmount(lower);
      
      return {
        action: 'BUY',
        token: token || undefined,
        amount: amount?.value,
        amountType: amount?.type,
        confidence: token && amount ? 0.8 : 0.5,
        reasoning: 'Buy keyword detected',
      };
    }

    // SELL command
    if (lower.includes('sell') || lower.includes('short')) {
      const token = this.extractToken(lower);
      const amount = this.extractAmount(lower);
      
      return {
        action: 'SELL',
        token: token || undefined,
        amount: amount?.value,
        amountType: amount?.type,
        confidence: token && amount ? 0.8 : 0.5,
        reasoning: 'Sell keyword detected',
      };
    }

    return {
      action: 'UNKNOWN',
      confidence: 0,
      reasoning: 'Could not parse command',
    };
  }

  /**
   * Extract token symbol from command
   */
  private extractToken(command: string): string | null {
    // All supported tokens on Arbitrum
    const tokens = [
      'WETH', 'WBTC', 'ARB', 'LINK', 'UNI', 'PENDLE', 'GMX', 
      'GRT', 'AAVE', 'CRV', 'LDO', 'PEPE', 'MATIC', 'SOL',
      'BTC', 'ETH' // ETH will be converted to WETH
    ];
    
    const upperCommand = command.toUpperCase();
    
    // First, try to match "of [TOKEN]" pattern (most explicit)
    const ofPattern = /\bOF\s+([A-Z]+)/i;
    const ofMatch = upperCommand.match(ofPattern);
    if (ofMatch) {
      const potentialToken = ofMatch[1];
      if (tokens.includes(potentialToken)) {
        // Convert BTC to WBTC and ETH to WETH
        if (potentialToken === 'ETH') return 'WETH';
        if (potentialToken === 'BTC') return 'WBTC';
        return potentialToken;
      }
    }
    
    // Fallback: Look for any token, but exclude amount context
    // Remove common amount phrases to avoid matching USDC in "1 USDC"
    const cleanedCommand = upperCommand
      .replace(/\d+(\.\d+)?\s*(USDC|USD|DOLLARS?)/gi, '')
      .replace(/\bUSDC\s+OF\b/gi, ''); // Remove "USDC of" pattern
    
    // Sort by length (longest first) to match multi-char tokens first
    const sortedTokens = tokens.sort((a, b) => b.length - a.length);
    
    for (const token of sortedTokens) {
      if (cleanedCommand.includes(token)) {
        // Convert BTC to WBTC and ETH to WETH for consistency
        if (token === 'ETH' && !cleanedCommand.includes('WETH')) return 'WETH';
        if (token === 'BTC' && !cleanedCommand.includes('WBTC')) return 'WBTC';
        return token;
      }
    }

    return null;
  }

  /**
   * Extract amount from command
   */
  private extractAmount(command: string): { value: number; type: 'USDC' | 'PERCENTAGE' } | null {
    // Check for percentage (e.g., "50%", "50 percent")
    const percentMatch = command.match(/(\d+(?:\.\d+)?)\s*(%|percent)/i);
    if (percentMatch) {
      return {
        value: parseFloat(percentMatch[1]),
        type: 'PERCENTAGE',
      };
    }

    // Check for USDC amount (e.g., "$10", "10 usdc", "10 dollars")
    const usdcMatch = command.match(/\$?\s*(\d+(?:\.\d+)?)\s*(usdc|usd|dollars?)?/i);
    if (usdcMatch) {
      return {
        value: parseFloat(usdcMatch[1]),
        type: 'USDC',
      };
    }

    return null;
  }

  /**
   * Format parsed intent for user confirmation
   */
  formatConfirmation(intent: ParsedIntent, walletBalance?: number): string {
    switch (intent.action) {
      case 'BUY':
        let buyMsg = `🟢 *BUY ${intent.token || '???'}*\n\n`;
        if (intent.amountType === 'USDC') {
          buyMsg += `Amount: $${intent.amount} USDC`;
        } else if (intent.amountType === 'PERCENTAGE') {
          const usdcAmount = walletBalance ? (walletBalance * intent.amount!) / 100 : 0;
          buyMsg += `Amount: ${intent.amount}% of balance`;
          if (walletBalance) {
            buyMsg += ` (~$${usdcAmount.toFixed(2)} USDC)`;
          }
        }
        buyMsg += `\n\nConfirm this trade?`;
        return buyMsg;

      case 'SELL':
      case 'CLOSE':
        return `🔴 *CLOSE ${intent.token || 'ALL'} POSITION(S)*\n\nThis will swap your tokens back to USDC.\n\nConfirm?`;

      case 'STATUS':
        return '📊 Fetching your positions...';

      case 'HELP':
        return `🤖 *Maxxit Trading Bot*\n\nCommands:\n• "Buy 10 USDC of WETH"\n• "Buy 5% WETH"\n• "Close my WETH"\n• "Status"\n\nJust type naturally!`;

      default:
        return `❓ Sorry, I didn't understand that command.\n\nTry: "Buy 10 USDC of WETH" or type "help"`;
    }
  }
}

export function createCommandParser(): TelegramCommandParser {
  return new TelegramCommandParser();
}

