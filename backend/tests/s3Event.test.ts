import { describe, expect, it } from "vitest";
import { parseS3EventMessage } from "../src/s3Event.js";

function s3EventBody(key: string) {
  return JSON.stringify({
    Records: [{ s3: { bucket: { name: "my-bucket" }, object: { key } } }],
  });
}

describe("parseS3EventMessage", () => {
  it("extracts the bucket, key and jobId from a standard upload key", () => {
    const result = parseS3EventMessage(s3EventBody("uploads/01J8Z9Q8N9F3K2X1V6Y7W8R5T0.pdf"));
    expect(result).toEqual({
      bucket: "my-bucket",
      key: "uploads/01J8Z9Q8N9F3K2X1V6Y7W8R5T0.pdf",
      jobId: "01J8Z9Q8N9F3K2X1V6Y7W8R5T0",
    });
  });

  it("url-decodes the key before matching", () => {
    const result = parseS3EventMessage(s3EventBody("uploads/abc%2Bdef.pdf"));
    expect(result.jobId).toBe("abc+def");
  });

  it("throws for a key outside the expected uploads/<id>.pdf shape", () => {
    expect(() => parseS3EventMessage(s3EventBody("other/place.pdf"))).toThrow();
  });

  it("throws when the SQS body has no S3 record", () => {
    expect(() => parseS3EventMessage(JSON.stringify({ Records: [] }))).toThrow();
  });
});
