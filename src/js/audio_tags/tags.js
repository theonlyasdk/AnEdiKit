// AnEdiKit - Tag field operations (autofill / revert / clear).
import { getAudioTagQueue, getSelectedTrackIndex, isTrackModified, loadTrackIntoForm, parseFilenameTags, syncActiveTrackFromForm, notifyChange } from "./queue.js";
import { updateCoverUI } from "./cover.js";
import { updateQueueRowText, updateQueueRowThumbnail } from "./render.js";
import { buildAudioTagsCommand } from "../commands.js";

export function autoFillActiveTrack() {
  if (getSelectedTrackIndex() < 0 || getSelectedTrackIndex() >= getAudioTagQueue().length) return;
  const track = getAudioTagQueue()[getSelectedTrackIndex()];

  const parsed = parseFilenameTags(track.fileName);
  if (parsed.title) {
    const titleEl = document.getElementById("tag-title");
    if (titleEl) titleEl.value = parsed.title;
    track.title = parsed.title;
  }
  if (parsed.artist) {
    const artistEl = document.getElementById("tag-artist");
    if (artistEl) artistEl.value = parsed.artist;
    track.artist = parsed.artist;
  }
  if (parsed.album) {
    const albumEl = document.getElementById("tag-album");
    if (albumEl) albumEl.value = parsed.album;
    track.album = parsed.album;
  }
  if (parsed.track) {
    const trackEl = document.getElementById("tag-track");
    if (trackEl) trackEl.value = parsed.track;
    track.track = parsed.track;
  }

  track.status = isTrackModified(track) ? "modified" : "ready";
  updateQueueRowText(getSelectedTrackIndex(), track);
  notifyChange();
}


export function revertActiveTrack() {
  if (getSelectedTrackIndex() < 0 || getSelectedTrackIndex() >= getAudioTagQueue().length) return;
  const track = getAudioTagQueue()[getSelectedTrackIndex()];
  if (!track.originalMeta) return;

  const o = track.originalMeta;
  track.title = o.title || "";
  track.artist = o.artist || "";
  track.album = o.album || "";
  track.albumArtist = o.album_artist || "";
  track.track = o.track || "";
  track.totalTracks = o.total_tracks || "";
  track.disc = o.disc || "";
  track.year = o.year || "";
  track.genre = o.genre || "";
  track.composer = o.composer || "";
  track.comment = o.comment || "";
  track.coverAction = o.cover_data_url ? "keep" : "none";
  track.coverDataUrl = o.cover_data_url || "";
  track.chosenCoverPath = "";
  track.status = "ready";

  loadTrackIntoForm(track);
  updateQueueRowText(getSelectedTrackIndex(), track);
  updateQueueRowThumbnail(getSelectedTrackIndex(), track);
  notifyChange();
}


export function clearActiveTrackTags() {
  if (getSelectedTrackIndex() < 0 || getSelectedTrackIndex() >= getAudioTagQueue().length) return;
  const track = getAudioTagQueue()[getSelectedTrackIndex()];

  const tagFieldIds = [
    "tag-title",
    "tag-artist",
    "tag-album",
    "tag-album-artist",
    "tag-track",
    "tag-total-tracks",
    "tag-disc",
    "tag-year",
    "tag-genre",
    "tag-composer",
    "tag-comment",
  ];

  for (const id of tagFieldIds) {
    const el = document.getElementById(id);
    if (el) el.value = "";
    const key = id.replace("tag-", "").replace("-", "");
    track[key] = "";
  }

  track.title = "";
  track.artist = "";
  track.album = "";
  track.albumArtist = "";
  track.track = "";
  track.totalTracks = "";
  track.disc = "";
  track.year = "";
  track.genre = "";
  track.composer = "";
  track.comment = "";
  track.coverAction = "remove";
  track.coverDataUrl = "";
  track.chosenCoverPath = "";
  track.status = "modified";

  updateCoverUI(track);
  updateQueueRowText(getSelectedTrackIndex(), track);
  updateQueueRowThumbnail(getSelectedTrackIndex(), track);
  notifyChange();
}
