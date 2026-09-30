// AnEdiKit - Audio-tag queue execution.
import { getAudioTagQueue, syncActiveTrackFromForm, notifyChange } from "./queue.js";
import { updateQueueRowText } from "./render.js";
import { buildAudioTagsCommand } from "../commands.js";
import { showBatchFinishedNotification } from "../runner.js";

export async function executeAudioTagsQueue(executeFfmpegJob, isCancelRequested, resetCancelFlag) {
  if (getAudioTagQueue().length === 0) return;

  // Make sure current active track inputs are synced before executing
  syncActiveTrackFromForm();
  resetCancelFlag();

  const isBatch = getAudioTagQueue().length > 1;
  const batchStartTime = Date.now();
  let successCount = 0;
  let failCount = 0;
  let lastDestination = "";

  for (let i = 0; i < getAudioTagQueue().length; i++) {
    if (isCancelRequested()) break;

    const track = getAudioTagQueue()[i];
    track.status = "processing";
    updateQueueRowText(i, track);

    const tempOutPath = `${track.filePath}.tmp_${Date.now()}_${i}.${track.ext}`;

    let oggMetaPath = "";
    if (track.ext === "ogg" && track.coverAction === "replace" && track.chosenCoverPath) {
      if (window.__TAURI__?.core?.invoke) {
        try {
          oggMetaPath = await window.__TAURI__.core.invoke("prepare_ogg_cover_metadata", {
            imagePath: track.chosenCoverPath,
          });
        } catch (e) {
          console.warn("prepare_ogg_cover_metadata error:", e);
        }
      }
    }

    const cmdObj = buildAudioTagsCommand(track.filePath, "", {}, {
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      track: track.track,
      totalTracks: track.totalTracks,
      disc: track.disc,
      year: track.year,
      genre: track.genre,
      composer: track.composer,
      comment: track.comment,
      coverAction: track.coverAction,
      coverPath: track.chosenCoverPath,
      tempOggMetaPath: oggMetaPath,
      customOutPath: tempOutPath,
    });

    if (isBatch) {
      cmdObj.suppressNotification = true;
    }

    const success = await executeFfmpegJob(cmdObj, 1.0);

    if (isCancelRequested()) {
      track.status = "ready";
      updateQueueRowText(i, track);
      break;
    }

    if (success) {
      if (window.__TAURI__?.core?.invoke) {
        try {
          await window.__TAURI__.core.invoke("replace_file", {
            sourceTemp: tempOutPath,
            targetDest: track.filePath,
          });
          track.status = "done";
          successCount++;
          lastDestination = track.filePath;
          track.originalMeta = {
            title: track.title,
            artist: track.artist,
            album: track.album,
            album_artist: track.albumArtist,
            track: track.track,
            total_tracks: track.totalTracks,
            disc: track.disc,
            year: track.year,
            genre: track.genre,
            composer: track.composer,
            comment: track.comment,
            cover_data_url: track.coverDataUrl,
          };
        } catch (err) {
          console.error("replace_file error:", err);
          track.status = "error";
          failCount++;
        }
      } else {
        track.status = "done";
        successCount++;
        lastDestination = track.filePath;
      }
    } else {
      track.status = "error";
      failCount++;
    }

    updateQueueRowText(i, track);
  }

  if (isBatch && !isCancelRequested() && successCount > 0) {
    const batchElapsedSeconds = batchStartTime > 0 ? ((Date.now() - batchStartTime) / 1000).toFixed(1) : "0.0";
    showBatchFinishedNotification({
      destination: lastDestination,
      toolName: "Audio Tagging",
      total: getAudioTagQueue().length,
      successCount,
      failCount,
      elapsedSeconds: batchElapsedSeconds,
    });
  }

  notifyChange();
}
