const test = require("node:test");
const assert = require("node:assert/strict");

const { createMemoryKv } = require("../lib/kv");
const { DEFAULT_SETTINGS, deletePost, getPostBySlug, getSettings, listPosts, savePost, saveSettings } = require("../lib/content-store");

function post(id, slug, status, publishedAt) {
  return { id, slug, title: slug, status, publishedAt, videos: [] };
}

test("content repository supports immutable upsert, ordering, drafts and delete", async () => {
  const client = createMemoryKv();
  await savePost(post("1", "older", "published", "2026-08-01T00:00:00Z"), client);
  await savePost(post("2", "newer", "draft", "2026-08-02T00:00:00Z"), client);
  await savePost(post("3", "newest", "published", "2026-08-03T00:00:00Z"), client);

  const all = await listPosts({ page: 1, limit: 10 }, client);
  assert.deepEqual(all.posts.map((item) => item.id), ["3", "2", "1"]);
  assert.equal(all.total, 3);

  const published = await listPosts({ page: 1, limit: 10, publishedOnly: true }, client);
  assert.deepEqual(published.posts.map((item) => item.id), ["3", "1"]);
  assert.equal((await getPostBySlug("newest", client)).id, "3");

  await savePost({ ...post("3", "renamed", "published", "2026-08-03T00:00:00Z") }, client);
  assert.equal(await getPostBySlug("newest", client), null);
  assert.equal((await getPostBySlug("renamed", client)).id, "3");
  assert.equal(await deletePost("3", client), true);
  assert.equal(await deletePost("missing", client), false);

  await assert.rejects(
    savePost(post("4", "older", "published", "2026-08-04T00:00:00Z"), client),
    /Slug đã được sử dụng/,
  );
});

test("website logo remains fixed when stored settings try to override it", async () => {
  const client = createMemoryKv();
  const saved = await saveSettings({ logoUrl: "https://cdn.example.com/other-logo.png" }, client);
  assert.equal(saved.logoUrl, DEFAULT_SETTINGS.logoUrl);
  assert.equal((await getSettings(client)).logoUrl, DEFAULT_SETTINGS.logoUrl);
  assert.equal(DEFAULT_SETTINGS.logoUrl, "/assets/ncdp-street-icon.webp");
  assert.equal(DEFAULT_SETTINGS.fanpageUrl, "");
});
