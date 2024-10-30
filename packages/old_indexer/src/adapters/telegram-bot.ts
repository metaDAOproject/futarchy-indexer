import axios, { AxiosInstance, AxiosResponse } from "axios";

type TelegramBotConfig = {
  token: string;
};

export class TelegramBotAPI implements AlertChatBotInterface {
  private readonly apiUrl: string;
  private readonly httpClient: AxiosInstance;

  constructor(config: TelegramBotConfig) {
    this.apiUrl = `https://api.telegram.org/bot${config.token}/`;
    this.httpClient = axios.create({
      baseURL: this.apiUrl,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  private async request<T>(
    method: "GET" | "POST",
    endpoint: string,
    params?: object
  ): Promise<ChatbotApiResponse<T> | null> {
    let response: AxiosResponse<ChatbotApiResponse<T>>;
    try {
      if (method === "GET") {
        response = await this.httpClient.get(endpoint, { params });
      } else {
        response = await this.httpClient.post(endpoint, params);
      }
      return response.data;
    } catch (error) {
      console.error(
        `Failed to make request: ${error}. Method: ${method}. Endpoint: ${endpoint}`
      );
      return null;
    }
  }

  public async getMe(): Promise<ChatbotApiResponse<any> | null> {
    return this.request("GET", "getMe");
  }

  public async sendMessage(
    chatId: number | string,
    text: string
  ): Promise<ChatbotApiResponse<any> | null> {
    const params = { chat_id: chatId, text };
    try {
      return this.request("POST", "sendMessage", params);
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  public async getUpdates(
    offset?: number,
    limit?: number,
    timeout?: number,
    allowed_updates?: string[]
  ): Promise<ChatbotApiResponse<any> | null> {
    const params = { offset, limit, timeout, allowed_updates };
    return this.request("GET", "getUpdates", params);
  }

  // Add more methods as needed for other API endpoints
}

type ChatbotApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

export interface AlertChatBotInterface {
  getMe(): Promise<ChatbotApiResponse<any> | null>;
  sendMessage(
    chatId: number | string,
    text: string
  ): Promise<ChatbotApiResponse<any> | null>;
  getUpdates(
    offset?: number,
    limit?: number,
    timeout?: number,
    allowed_updates?: string[]
  ): Promise<ChatbotApiResponse<any> | null>;
}
