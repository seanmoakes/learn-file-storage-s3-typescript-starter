import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { randomBytes, type UUID } from "crypto";
import { mediaTypeToExt, getAssetDiskPath, getS3URL } from "./assets";

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

  const ext = mediaTypeToExt(mediaType);
  const fileId = randomBytes(32).toString("base64url");
  const filename = `${fileId}${ext}`;

  const assetDiskPath = getAssetDiskPath(cfg, filename);
  await Bun.write(assetDiskPath, file);

  const s3File = cfg.s3Client.file(filename);
  await s3File.write(Bun.file(assetDiskPath), {
    type: mediaType,
  });

  const urlPath = getS3URL(cfg, filename);
  video.videoURL = urlPath;

  await Bun.file(assetDiskPath).delete();
  updateVideo(cfg.db, video);

  return respondWithJSON(200, null);
}
