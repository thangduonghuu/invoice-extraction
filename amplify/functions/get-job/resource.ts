import { defineFunction } from "@aws-amplify/backend";

export const getJob = defineFunction({
  name: "get-job",
  entry: "./handler.ts",
  runtime: 20,
  memoryMB: 1024,
  timeoutSeconds: 60,
  resourceGroupName: "invoiceExtractorResources",
});
