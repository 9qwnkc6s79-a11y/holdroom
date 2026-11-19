import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRunpodChatOutput, runpodApiRoot, runpodEndpointId } from "./runpod-jobs.ts";

describe("runpod jobs", () => {
  it("reads the endpoint id from the OpenAI base URL", () => {
    const base = "https://api.runpod.ai/v2/diqb3ykkxo0i16/openai/v1";
    assert.equal(runpodEndpointId(base), "diqb3ykkxo0i16");
    assert.equal(runpodApiRoot(base), "https://api.runpod.ai/v2/diqb3ykkxo0i16");
  });

  it("reads a chat completion and does not keep a secret stuffed into tool markup", () => {
    const parsed = parseRunpodChatOutput({
      output: {
        choices: [
          {
            message: {
              content: "Draft ready.\n<tool_call>{\"name\":\"write_draft\",\"arguments\":{\"filename\":\"memo.md\",\"text\":\"hello\"}}</tool_call>",
              tool_calls: [
                {
                  function: {
                    name: "use_vault",
                    arguments: JSON.stringify({ itemName: "Payroll", password: "super-secret-value" }),
                  },
                },
              ],
            },
          },
        ],
      },
    });
    assert.equal(parsed.toolCalls[0]?.name, "use_vault");
    assert.equal(parsed.toolCalls[0]?.arguments.itemName, "Payroll");
    assert.equal(parsed.toolCalls.some((call) => call.name === "write_draft"), true);
    assert.equal(parsed.text.includes("tool_call"), false);
  });
});
