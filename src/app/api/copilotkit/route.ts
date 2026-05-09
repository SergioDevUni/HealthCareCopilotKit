import {
  CopilotRuntime,
  GoogleGenerativeAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";

const runtime = new CopilotRuntime({
  a2ui: {
    injectA2UITool: true,
  },
});

const serviceAdapter = new GoogleGenerativeAIAdapter({
  apiKey: process.env.GOOGLE_API_KEY,
  model: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite-preview",
  apiVersion: "v1beta",
});

const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
  runtime,
  serviceAdapter,
  endpoint: "/api/copilotkit",
});

export const POST = handleRequest;

