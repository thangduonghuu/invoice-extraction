import { defineFunction } from "@aws-amplify/backend";

export const createJob = defineFunction({
  name: "create-job",
  entry: "./handler.ts",
  runtime: 20,
  memoryMB: 1024,
  timeoutSeconds: 60,
  // Co-locate with the table/bucket/queue/api it needs IAM grants and env
  // vars from (set in backend.ts) - otherwise CDK sees a circular
  // dependency between the default "function" stack and that custom stack.
  resourceGroupName: "invoiceExtractorResources",
});
