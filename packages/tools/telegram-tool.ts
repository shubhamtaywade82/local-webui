import { BaseTool, ToolSchema } from "./types";
import { sendTelegramTradeAlert } from "./telegram-send";

export class TelegramAlertTool extends BaseTool {
  readonly name = "telegram_alert";
  readonly description = "Send a professional trading alert to the user's Telegram channel with full SMC setup details.";

  readonly schema: ToolSchema = {
    name: "telegram_alert",
    description: "Send a professional trading alert to Telegram.",
    args: {
      symbol: { type: "string", description: "The ticker symbol (e.g., B-ETH_USDT)", required: true },
      direction: { type: "string", description: "Long or Short", required: true },
      setupName: { type: "string", description: "e.g., 15m Buyside Sweep + ChoCh", required: true },
      entryRange: { type: "string", description: "Target entry price range", required: true },
      stopLoss: { type: "string", description: "Stop loss price", required: true },
      takeProfit: { type: "string", description: "Take profit price(s)", required: true },
      analysisSummary: { type: "string", description: "Brief SMC logic for the trade", required: true }
    }
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const { symbol, direction, setupName, entryRange, stopLoss, takeProfit, analysisSummary } = args;
    const dir = String(direction).toLowerCase() === 'long' ? 'Long' : 'Short';
    const result = await sendTelegramTradeAlert({
      symbol: String(symbol),
      direction: dir,
      setupName: String(setupName),
      entryRange: String(entryRange),
      stopLoss: String(stopLoss),
      takeProfit: String(takeProfit),
      analysisSummary: String(analysisSummary),
    });
    if (!result.ok) {
      if (result.error.includes('TELEGRAM_')) {
        return `Error: ${result.error}`;
      }
      return `Failed to send Telegram alert: ${result.error}`;
    }
    return `Successfully sent Telegram alert for ${symbol} (${direction})`;
  }
}
