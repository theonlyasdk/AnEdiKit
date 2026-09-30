// fixYoutubeUrl: URL normalization + tracking-param stripping.
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { fixYoutubeUrl, isPlaylistOrAlbumUrl } from "../../src/js/ytdlp_url.js";

describe("ytdlp_url.js: fixYoutubeUrl", () => {
  it("normalizes youtu.be short links and drops tracking params", () => {
    assert.equal(
      fixYoutubeUrl("https://youtu.be/86DvZHUgqms?si=tAtzyzbr42egeZfW"),
      "https://www.youtube.com/watch?v=86DvZHUgqms",
    );
  });

  it("adds a scheme when the input omits it", () => {
    assert.equal(fixYoutubeUrl("youtu.be/abc123"), "https://www.youtube.com/watch?v=abc123");
  });

  it("keeps allowlisted params (list, t, index) and drops the rest", () => {
    assert.equal(
      fixYoutubeUrl("https://music.youtube.com/watch?v=86DvZHUgqms&playnext=1&list=PL123"),
      "https://www.youtube.com/watch?v=86DvZHUgqms&list=PL123",
    );
    assert.equal(
      fixYoutubeUrl("https://www.youtube.com/watch?v=abc&feature=share&si=xyz&t=30"),
      "https://www.youtube.com/watch?v=abc&t=30",
    );
    assert.equal(
      fixYoutubeUrl("https://youtu.be/abc?t=42"),
      "https://www.youtube.com/watch?v=abc&t=42",
    );
  });

  it("handles shorts, live, embed and mobile hosts", () => {
    assert.equal(
      fixYoutubeUrl("https://www.youtube.com/shorts/abc123"),
      "https://www.youtube.com/watch?v=abc123",
    );
    assert.equal(
      fixYoutubeUrl("https://m.youtube.com/live/xyz789"),
      "https://www.youtube.com/watch?v=xyz789",
    );
    assert.equal(
      fixYoutubeUrl("https://www.youtube.com/embed/embedId"),
      "https://www.youtube.com/watch?v=embedId",
    );
  });

  it("keeps playlist links as playlists", () => {
    assert.equal(
      fixYoutubeUrl("https://music.youtube.com/playlist?list=PLxyz"),
      "https://www.youtube.com/playlist?list=PLxyz",
    );
  });

  it("strips allowlisted-only params from other youtube.com paths", () => {
    assert.equal(
      fixYoutubeUrl("https://m.youtube.com/results?search_query=hello"),
      "https://www.youtube.com/results",
    );
  });

  it("leaves non-YouTube URLs untouched", () => {
    assert.equal(fixYoutubeUrl("https://vimeo.com/12345"), "https://vimeo.com/12345");
  });

  it("returns falsy input unchanged", () => {
    assert.equal(fixYoutubeUrl(null), null);
    assert.equal(fixYoutubeUrl(""), "");
    assert.equal(fixYoutubeUrl(undefined), undefined);
  });

  it("trims surrounding whitespace", () => {
    assert.equal(
      fixYoutubeUrl("  https://youtu.be/abc  "),
      "https://www.youtube.com/watch?v=abc",
    );
  });
});

describe("ytdlp_url.js: isPlaylistOrAlbumUrl", () => {
  it("detects YouTube Music playlist and album URLs", () => {
    assert.equal(
      isPlaylistOrAlbumUrl("https://music.youtube.com/playlist?list=OLAK5uy_ku2cdWECBFs9PQfSOnwp1XZQDggzoKMqM&si=F2r5G58w4LsRn7_3"),
      true,
    );
    assert.equal(
      isPlaylistOrAlbumUrl("https://music.youtube.com/playlist?list=PL12345"),
      true,
    );
    assert.equal(
      isPlaylistOrAlbumUrl("music.youtube.com/playlist?list=OLAK5uy_abc"),
      true,
    );
  });

  it("detects standard YouTube playlist URLs", () => {
    assert.equal(
      isPlaylistOrAlbumUrl("https://www.youtube.com/playlist?list=PLrAXtmErZgOdP_8GztsuKi9nrraNbKKp4"),
      true,
    );
    assert.equal(
      isPlaylistOrAlbumUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL12345"),
      true,
    );
  });

  it("detects URLs with album or playlist paths", () => {
    assert.equal(
      isPlaylistOrAlbumUrl("https://youtube.com/playlist?list=RDCLAK5uy"),
      true,
    );
    assert.equal(
      isPlaylistOrAlbumUrl("https://music.youtube.com/album/OLAK5uy_ku2cdWECBFs9PQfSOnwp1XZQDggzoKMqM"),
      true,
    );
  });

  it("returns false for single video or track URLs", () => {
    assert.equal(
      isPlaylistOrAlbumUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      false,
    );
    assert.equal(
      isPlaylistOrAlbumUrl("https://music.youtube.com/watch?v=MTXXdP9DH4Y"),
      false,
    );
    assert.equal(
      isPlaylistOrAlbumUrl("https://youtu.be/86DvZHUgqms"),
      false,
    );
  });

  it("returns false for non-playlist non-album inputs", () => {
    assert.equal(isPlaylistOrAlbumUrl(""), false);
    assert.equal(isPlaylistOrAlbumUrl(null), false);
    assert.equal(isPlaylistOrAlbumUrl(undefined), false);
    assert.equal(isPlaylistOrAlbumUrl("https://vimeo.com/12345"), false);
  });
});

