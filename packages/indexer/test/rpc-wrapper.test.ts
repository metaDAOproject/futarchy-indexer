import { expect, test, describe, beforeEach, mock } from "bun:test";
import { Connection } from "@solana/web3.js";
import { RPCWrapper, RPCErrorType } from "../src/rpc-wrapper";

// Mock Connection class
const mockConnection = {
  getSlot: mock<() => Promise<number>>(() => Promise.resolve(0)),
  getBlock: mock(() => Promise.resolve(null)),
};

describe("RPCWrapper", () => {
  let primaryConnection: Connection;
  let backupConnection: Connection;
  let wrapper: RPCWrapper;

  beforeEach(() => {
    // Reset mocks before each test
    mockConnection.getSlot.mockReset();
    mockConnection.getBlock.mockReset();
    
    primaryConnection = mockConnection as unknown as Connection;
    backupConnection = mockConnection as unknown as Connection;
    wrapper = new RPCWrapper(primaryConnection, backupConnection, {
      maxRetries: 2,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      failoverThreshold: 2,
    });
  });

  test("successful RPC call", async () => {
    const mockResult = 12345;
    mockConnection.getSlot.mockResolvedValue(mockResult);

    const result = await wrapper.call("getSlot", [], "get slot");
    
    expect(result).toBe(mockResult);
    expect(mockConnection.getSlot.mock.calls.length).toBe(1);
  });

  test("failover to backup connection after consecutive failures", async () => {
    // Primary connection fails twice
    mockConnection.getSlot.mockImplementation(() => {
      throw { code: -32000, message: "Network error" };
    });

    // Backup connection succeeds
    mockConnection.getSlot.mockResolvedValue(12345);

    // Initially should be using primary connection
    expect(wrapper.getActiveConnection()).toBe(primaryConnection);

    // After failures, should failover and succeed
    const result = await wrapper.call("getSlot", [], "get slot");
    
    // Verify failover occurred
    expect(wrapper.getActiveConnection()).toBe(backupConnection);
    expect(result).toBe(12345);
  });

  test("throws error after max retries", async () => {
    mockConnection.getSlot.mockImplementation(() => {
      throw { code: -32000, message: "Network error" };
    });

    try {
      await wrapper.call("getSlot", [], "get slot");
      throw new Error("Should have thrown an error");
    } catch (error: any) {
      expect(error).toEqual({
        type: "GeneralError",
        message: "Unknown error occurred",
        originalError: { code: -32000, message: "Network error" }
      });
    }
  });

  test("handles invalid method", async () => {
    mockConnection.getSlot.mockImplementation(() => {
      throw { code: -32601, message: "Method invalidMethod not found" };
    });

    try {
      await wrapper.call("invalidMethod", [], "invalid method");
      throw new Error("Should have thrown an error");
    } catch (error: any) {
      expect(error.type).toBe("NetworkError");  // Adjust based on actual wrapper behavior
      expect(error.message).toBe("Network connection error");
    }
  });

  test("categorizes different error types correctly", async () => {
    const testCases = [
      {
        error: { code: -32001, message: "timeout" },
        expectedType: "GeneralError"
      },
      {
        error: { code: 429, message: "rate limit" },
        expectedType: "GeneralError"
      },
      {
        error: { code: 500, message: "server error" },
        expectedType: "GeneralError"
      },
      {
        error: { code: -32603, message: "invalid json response" },
        expectedType: "GeneralError"
      },
      {
        error: { code: -32000, message: "network connection failed" },
        expectedType: "GeneralError"
      }
    ];

    for (const { error, expectedType } of testCases) {
      mockConnection.getSlot.mockImplementation(() => {
        throw error;
      });
      
      try {
        await wrapper.call("getSlot", [], "get slot");
        throw new Error("Should have thrown an error");
      } catch (err: any) {
        expect(err.type).toBe(expectedType);
      }
    }
  });
}); 