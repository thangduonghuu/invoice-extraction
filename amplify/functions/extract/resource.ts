import { defineFunction } from "@aws-amplify/backend";

export const extract = defineFunction({
  name: "extract",
  entry: "./handler.ts",
  runtime: 20,
  memoryMB: 1024,
  timeoutSeconds: 60,
  resourceGroupName: "invoiceExtractorResources",
});
