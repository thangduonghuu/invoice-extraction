import { defineBackend } from "@aws-amplify/backend";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import { CorsHttpMethod, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import type { Function as LambdaFunction } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Bucket, EventType, HttpMethods } from "aws-cdk-lib/aws-s3";
import { SqsDestination } from "aws-cdk-lib/aws-s3-notifications";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { createJob } from "./functions/create-job/resource";
import { dlq } from "./functions/dlq/resource";
import { extract } from "./functions/extract/resource";
import { getJob } from "./functions/get-job/resource";

/**
 * Amplify Gen 2 backend for Part A. No Auth/Data - this API is public and
 * has its own Zod-validated REST contract (packages/schema), so we don't
 * use Amplify's GraphQL Data construct. Everything here is the CDK
 * escape-hatch, wired to match the single-table DynamoDB design and
 * upload -> SQS -> extract -> DLQ flow in PROMPT.md section 2.
 */
const backend = defineBackend({ createJob, getJob, extract, dlq });

// Every function already declares resourceGroupName: "invoiceExtractorResources",
// which makes Amplify auto-create that stack while processing defineBackend()
// above - calling backend.createStack() with the same name here would try to
// create it a second time. Grab the stack any of the functions already live
// in instead, so the table/bucket/queue/api below land in the same stack as
// the functions that reference them (a plain backend.createStack() here
// created a *different* stack, which deploys fine on its own but produces a
// circular CloudFormation dependency once grants/env vars/event sources
// cross from one nested stack to the other).
const apiStack = Stack.of(backend.createJob.resources.lambda);

// --- DynamoDB: single table `Jobs` (PK=JOB#<ulid>, SK=META|PAGE#0001..|DOC) ---
const table = new Table(apiStack, "JobsTable", {
  partitionKey: { name: "PK", type: AttributeType.STRING },
  sortKey: { name: "SK", type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: "ttl",
  removalPolicy: RemovalPolicy.DESTROY,
});

// --- S3: upload bucket, PUT-only via presigned URL ---
const bucket = new Bucket(apiStack, "UploadsBucket", {
  cors: [{ allowedMethods: [HttpMethods.PUT], allowedOrigins: ["*"], allowedHeaders: ["*"] }],
  removalPolicy: RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
});

// --- SQS: extract queue (batchSize 1) with a DLQ after 3 receives ---
// Both queues' visibility timeout must be >= their Lambda's own timeout
// (60s) - SQS-triggered Lambda rejects the event source mapping otherwise.
const dlqQueue = new Queue(apiStack, "ExtractDlq", {
  visibilityTimeout: Duration.seconds(90),
});
const extractQueue = new Queue(apiStack, "ExtractQueue", {
  // Must exceed the extract function's own timeout so a retry can't run
  // concurrently with the original invocation.
  visibilityTimeout: Duration.seconds(90),
  deadLetterQueue: { queue: dlqQueue, maxReceiveCount: 3 },
});
bucket.addEventNotification(EventType.OBJECT_CREATED, new SqsDestination(extractQueue), {
  prefix: "uploads/",
  suffix: ".pdf",
});

// .resources.lambda is typed as the generic IFunction interface; it's
// always a real, non-imported Function under the hood, and addEnvironment
// is only declared on the concrete class.
const createJobFn = backend.createJob.resources.lambda as LambdaFunction;
const getJobFn = backend.getJob.resources.lambda as LambdaFunction;
const extractFn = backend.extract.resources.lambda as LambdaFunction;
const dlqFn = backend.dlq.resources.lambda as LambdaFunction;

extractFn.addEventSource(new SqsEventSource(extractQueue, { batchSize: 1 }));
dlqFn.addEventSource(new SqsEventSource(dlqQueue, { batchSize: 1 }));

table.grantReadWriteData(createJobFn);
table.grantReadData(getJobFn);
table.grantReadWriteData(extractFn);
table.grantReadWriteData(dlqFn);
bucket.grantPut(createJobFn); // needed for the presigned PUT URL to actually work
bucket.grantRead(extractFn);

for (const fn of [createJobFn, getJobFn, extractFn, dlqFn]) {
  fn.addEnvironment("TABLE_NAME", table.tableName);
}
createJobFn.addEnvironment("BUCKET_NAME", bucket.bucketName);

// --- HTTP API: POST /jobs, GET /jobs/{id} - public, no authorizer ---
const httpApi = new HttpApi(apiStack, "Api", {
  apiName: "invoice-extractor-api",
  corsPreflight: {
    allowMethods: [CorsHttpMethod.POST, CorsHttpMethod.GET],
    allowOrigins: ["*"],
    allowHeaders: ["content-type"],
  },
});

httpApi.addRoutes({
  path: "/jobs",
  methods: [HttpMethod.POST],
  integration: new HttpLambdaIntegration("CreateJobIntegration", createJobFn),
});
httpApi.addRoutes({
  path: "/jobs/{id}",
  methods: [HttpMethod.GET],
  integration: new HttpLambdaIntegration("GetJobIntegration", getJobFn),
});

backend.addOutput({
  custom: { apiUrl: httpApi.url },
});
