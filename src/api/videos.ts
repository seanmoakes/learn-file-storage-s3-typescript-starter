import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { type UUID } from "crypto";
import { getS3URL } from "./assets";
import path from "path";
import { uploadVideoToS3 } from "../s3";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const MAX_UPLOAD_SIZE = 1 << 30; // 1GB
  const { videoId } = req.params as { videoId?: UUID };

  if (!videoId) {
    throw new BadRequestError("Invalid video UUID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const video = getVideo(cfg.db, videoId);
  if (userID !== video?.userID) {
    throw new UserForbiddenError("Not authorized to update this video");
  }
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const formData = await req.formData();
  const file = formData.get("video");
  if (!(file instanceof File)) {
    throw new BadRequestError("Video file missing");
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError(
      "Video size exceeds the maximum allowed size of 1GB",
    );
  }

  const mediaType = file.type;
  if (!mediaType) {
    throw new BadRequestError("Missing Content-Type for video")
  }
  if (mediaType !== "video/mp4") {
    throw new BadRequestError("Video is not an mp4 file");
  }

  const tempFilePath = path.join("/tmp", `${videoId}.mp4`);
  await Bun.write(tempFilePath, file);

  const aspectRatio = await getVideoAspectRatio(tempFilePath)
  const key = `${aspectRatio}/${videoId}.mp4`;
  await uploadVideoToS3(cfg, key, tempFilePath, "video/mp4");

  const urlPath = getS3URL(cfg, key);
  video.videoURL = urlPath;

  await Bun.file(tempFilePath).delete();
  updateVideo(cfg.db, video);

  return respondWithJSON(200, null);
}

export async function getVideoAspectRatio(filePath: string) {
  const proc = Bun.spawn(
    [
      "ffprobe",
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      filePath
    ],
    {
      stdout: "pipe",
      stderr: "pipe"
    },
  );


  const outputText = await new Response(proc.stdout).text();
  const errorText = await new Response(proc.stderr).text();

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`ffprobe error: ${errorText}`);
  }

  const output = JSON.parse(outputText);
  if (!output.streams || output.streams.length === 0) {
    throw new Error("No video streams found");
  }

  const { width, height } = output.streams[0];

  return width === Math.floor(16 * (height / 9))
    ? "landscape"
    : height === Math.floor(16 * (width / 9))
      ? "portrait"
      : "other";
}
