import { S3Client } from "bun";
import { newDatabase } from "./db/db";
import type { Database } from "bun:sqlite";

export type ApiConfig = {
  db: Database;
  jwtSecret: string;
  platform: string;
  filepathRoot: string;
  assetsRoot: string;
  s3Bucket: string;
  s3Region: string;
  s3CfDistribution: string;
  port: string;
  s3Client: S3Client;
};

const pathToDB = envOrThrow("DB_PATH");
const jwtSecret = envOrThrow("JWT_SECRET");
const platform = envOrThrow("PLATFORM");
const filepathRoot = envOrThrow("FILEPATH_ROOT");
const assetsRoot = envOrThrow("ASSETS_ROOT");
const s3Bucket = envOrThrow("S3_BUCKET");
const s3Region = envOrThrow("S3_REGION");
const s3CfDistribution = envOrThrow("S3_CF_DISTRO");
const port = envOrThrow("PORT");
const accessKeyId = envOrThrow("AWS_ACCESS_KEY_ID");
const secretAccessKey = envOrThrow("AWS_SECRET_ACCESS_KEY");

const db = newDatabase(pathToDB);
const s3Client = new S3Client({
  accessKeyId: accessKeyId,
  secretAccessKey: secretAccessKey,
  bucket: s3Bucket,
  region: s3Region,
});

export const cfg: ApiConfig = {
  db: db,
  jwtSecret: jwtSecret,
  platform: platform,
  filepathRoot: filepathRoot,
  assetsRoot: assetsRoot,
  s3Bucket: s3Bucket,
  s3Region: s3Region,
  s3CfDistribution: s3CfDistribution,
  port: port,
  s3Client: s3Client,
};

function envOrThrow(key: string) {
  const envVar = process.env[key];
  if (!envVar) {
    throw new Error(`${key} must be set`);
  }
  return envVar;
}
