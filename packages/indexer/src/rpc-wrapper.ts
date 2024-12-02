import { Connection } from "@solana/web3.js";
import { connection as primaryConnection, backupConnection } from "./connection";
import { logger } from "./logger";

export enum RPCErrorType {
  Timeout = "Timeout",
  RateLimitExceeded = "RateLimitExceeded",
  InvalidResponse = "InvalidResponse",
  GeneralError = "GeneralError",
  NetworkError = "NetworkError",
  InvalidMethod = "InvalidMethod",
  ServerError = "ServerError"
}

interface RPCError {
  type: RPCErrorType;
  message: string;
  originalError?: unknown;
}

interface RPCConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  failoverThreshold?: number;
}

const DEFAULT_CONFIG: RPCConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  failoverThreshold: 3
};

export class RPCWrapper {
  private primaryConnection: Connection;
  private backupConnection?: Connection;
  private config: RPCConfig;
  private consecutiveFailures: number = 0;
  private usingBackup: boolean = false;

  constructor(
    primaryConnection: Connection, 
    backupConnection?: Connection,
    config: Partial<RPCConfig> = {}
  ) {
    this.primaryConnection = primaryConnection;
    this.backupConnection = backupConnection;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private get activeConnection(): Connection {
    return this.usingBackup && this.backupConnection 
      ? this.backupConnection 
      : this.primaryConnection;
  }

  /**
   * Generic method to execute any RPC function with retry logic
   * @param methodName Name of the method to call on the connection
   * @param args Arguments to pass to the method
   * @param context Description of the operation for logging
   * @returns Promise of the operation result
   */
  async call<T>(
    methodName: string,
    args: any[] = [],
    context: string
  ): Promise<T> {
    console.log("RPCWrapper.call", methodName, args, context);
    let lastError: RPCError | null = null;
    
    for (let attempt = 0; attempt < (this.config.maxRetries ?? 3); attempt++) {
      try {
        if (!(methodName in this.activeConnection)) {
          throw new Error(`Method ${methodName} not found on connection`);
        }
        
        const method = this.activeConnection[methodName as keyof Connection] as (...args: any[]) => Promise<T>;
        const result = await method.apply(this.activeConnection, args);
        
        // Reset failure count on success
        this.consecutiveFailures = 0;
        if (this.usingBackup) {
          logger.info('Successfully failed back to primary connection');
          this.usingBackup = false;
        }
        
        return result;

      } catch (error) {
        lastError = this.categorizeError(error);
        
        logger.error(
          `RPC ${context} failed (attempt ${attempt + 1}/${this.config.maxRetries}):`,
          lastError
        );

        this.consecutiveFailures++;

        // Check if we should switch to backup connection
        if (
          this.backupConnection &&
          !this.usingBackup &&
          this.consecutiveFailures >= (this.config.failoverThreshold ?? 3)
        ) {
          logger.warn('Switching to backup RPC connection');
          this.usingBackup = true;
          // Reset retry counter to give the backup connection a fresh start
          attempt = 0;
          continue;
        }

        if (attempt === (this.config.maxRetries ?? 3) - 1) {
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          (this.config.baseDelayMs ?? 1000) * Math.pow(2, attempt),
          this.config.maxDelayMs ?? 10000
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  private categorizeError(error: unknown): RPCError {
    // Handle null/undefined errors
    if (!error) {
      return {
        type: RPCErrorType.GeneralError,
        message: "Unknown error occurred (null/undefined error)",
        originalError: error
      };
    }

    // Handle string errors
    if (typeof error === 'string') {
      return {
        type: RPCErrorType.GeneralError,
        message: error,
        originalError: error
      };
    }

    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      
      // Network related errors
      if (
        errorMessage.includes('network') || 
        errorMessage.includes('connection') ||
        errorMessage.includes('offline') ||
        errorMessage.includes('econnrefused')
      ) {
        return {
          type: RPCErrorType.NetworkError,
          message: "Network connection error",
          originalError: error
        };
      }

      // HTTP status code based errors
      if (errorMessage.includes("408") || errorMessage.includes("timeout")) {
        return {
          type: RPCErrorType.Timeout,
          message: "RPC request timed out",
          originalError: error
        };
      }

      if (errorMessage.includes("429")) {
        return {
          type: RPCErrorType.RateLimitExceeded,
          message: "RPC rate limit exceeded",
          originalError: error
        };
      }

      if (errorMessage.includes("500") || errorMessage.includes("503")) {
        return {
          type: RPCErrorType.ServerError,
          message: "RPC server error",
          originalError: error
        };
      }

      // Invalid JSON or unexpected response format
      if (
        errorMessage.includes('json') || 
        errorMessage.includes('parse') ||
        errorMessage.includes('unexpected')
      ) {
        return {
          type: RPCErrorType.InvalidResponse,
          message: "Invalid RPC response format",
          originalError: error
        };
      }
    }
    
    // Fallback error
    return {
      type: RPCErrorType.GeneralError,
      message: error instanceof Error ? error.message : "Unknown error occurred",
      originalError: error
    };
  }
}

// Create a singleton instance
export const rpc = new RPCWrapper(primaryConnection, backupConnection); 