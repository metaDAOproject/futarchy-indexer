import { Counter } from "@lukasdeco/prom-client";
import { AlertChatBotInterface, TelegramBotAPI } from "./adapters/telegram-bot";

const TELEGRAM_ALERT_CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID ?? "";

export class Logger {
  private errorCounter;
  private warnCounter;
  private chatBotApi: AlertChatBotInterface;

  constructor(chatBotApi: AlertChatBotInterface) {
    this.errorCounter = new Counter({
      name: "errors",
      help: "number of errors",
    });

    this.warnCounter = new Counter({
      name: "warnings",
      help: "number of warnings",
    });
    this.chatBotApi = chatBotApi;
  }

  log(...data: any[]): void {
    console.log(data);
  }

  info(...data: any[]): void {
    console.info(data);
  }

  error(...data: any[]): void {
    console.error(data);
    this.errorCounter.inc();
    this.chatBotApi.sendMessage(
      TELEGRAM_ALERT_CHAT_ID,
      data.map((d) => d.toString()).join(" ")
    );
  }

  warn(message: string): void {
    console.warn(message);
    this.warnCounter.inc();
  }
}

// TODO: add lint rule preventing default exports (default exports are antithetical to IDE auto refactors)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const telegramBotAPI = new TelegramBotAPI({
  token: TELEGRAM_BOT_TOKEN ?? "",
});
export const logger = new Logger(telegramBotAPI);
