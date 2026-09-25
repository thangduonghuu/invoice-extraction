/** S3 -> SQS delivers the raw S3 ObjectCreated event JSON as the SQS message body. */
interface S3EventRecord {
  s3: { bucket: { name: string }; object: { key: string } };
}
interface S3EventBody {
  Records: S3EventRecord[];
}

interface UploadedObject {
  bucket: string;
  key: string;
  jobId: string;
}

const KEY_RE = /^uploads\/([^/.]+)\.pdf$/;

export function parseS3EventMessage(sqsMessageBody: string): UploadedObject {
  const body = JSON.parse(sqsMessageBody) as S3EventBody;
  const record = body.Records?.[0];
  if (!record) throw new Error("SQS message did not contain an S3 event record");

  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
  const match = KEY_RE.exec(key);
  if (!match?.[1]) throw new Error(`Could not derive a jobId from S3 key "${key}"`);

  return { bucket, key, jobId: match[1] };
}
