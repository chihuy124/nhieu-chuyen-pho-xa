const test = require("node:test");
const assert = require("node:assert/strict");

const { createMemoryKv } = require("../lib/kv");
const {
  DEFAULT_SETTINGS,
  deletePost,
  getPost,
  getPostBySlug,
  getSettings,
  listPosts,
  restorePost,
  savePost,
  saveSettings,
  trashPost,
} = require("../lib/content-store");

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

test("legacy double-encoded WordPress slugs resolve through old and canonical URLs", async () => {
  const client = createMemoryKv();
  const encodedSlug = "%e2%9d%97%ef%b8%8fngay-luc-nay-%f0%9f%99%8f";
  await savePost({
    ...post("wp-hongbienpro-com-20443", encodedSlug, "published", "2026-08-11T13:58:00"),
    permalink: `/2026/08/11/${encodeURIComponent(encodedSlug)}/`,
  }, client);

  const listed = await listPosts({ page: 1, limit: 10 }, client);
  assert.equal(listed.posts[0].slug, "❗️ngay-luc-nay-🙏");
  assert.equal(listed.posts[0].permalink, "/2026/08/11/%E2%9D%97%EF%B8%8Fngay-luc-nay-%F0%9F%99%8F/");
  assert.equal((await getPostBySlug("❗️ngay-luc-nay-🙏", client)).id, "wp-hongbienpro-com-20443");
  assert.equal((await getPostBySlug(encodedSlug, client)).id, "wp-hongbienpro-com-20443");

  assert.equal(await deletePost("wp-hongbienpro-com-20443", client), true);
  assert.equal(await client.get(`content:slug:${encodedSlug}`), null);
});

test("soft-deleted posts stay hidden during recrawl, can be restored, and can be permanently deleted", async () => {
  const client = createMemoryKv();
  const original = await savePost(post("trash-1", "trash-lifecycle", "published", "2026-08-11T08:00:00Z"), client);

  assert.equal(await trashPost("missing", client), null);
  assert.equal(await restorePost("missing", client), null);
  assert.equal((await restorePost(original.id, client)).id, original.id);

  const trashed = await trashPost(original.id, client);
  assert.equal((await trashPost(original.id, client)).deletedAt, trashed.deletedAt);
  assert.equal(trashed.id, original.id);
  assert.ok(Number.isFinite(Date.parse(trashed.deletedAt)));
  assert.equal(await getPostBySlug(original.slug, client), null);
  assert.deepEqual((await listPosts({ page: 1, limit: 10 }, client)).posts, []);
  assert.deepEqual((await listPosts({ page: 1, limit: 10, publishedOnly: true }, client)).posts, []);
  assert.deepEqual((await listPosts({ page: 1, limit: 10, trashedOnly: true }, client)).posts.map((item) => item.id), [original.id]);

  const recrawled = await savePost({ ...original, title: "Crawler cập nhật lại" }, client);
  assert.equal(recrawled.deletedAt, trashed.deletedAt);
  assert.equal(await getPostBySlug(original.slug, client), null);
  assert.deepEqual((await listPosts({ page: 1, limit: 10 }, client)).posts, []);
  assert.equal((await listPosts({ page: 1, limit: 10, trashedOnly: true }, client)).posts[0].title, "Crawler cập nhật lại");

  const restored = await restorePost(original.id, client);
  assert.equal(restored.deletedAt, undefined);
  assert.equal((await getPostBySlug(original.slug, client)).id, original.id);
  assert.deepEqual((await listPosts({ page: 1, limit: 10 }, client)).posts.map((item) => item.id), [original.id]);

  await trashPost(original.id, client);
  assert.equal(await deletePost(original.id, client), true);
  assert.equal(await getPost(original.id, client), null);
  assert.deepEqual((await listPosts({ page: 1, limit: 10, trashedOnly: true }, client)).posts, []);
  await assert.doesNotReject(savePost(post("trash-2", original.slug, "published", "2026-08-12T08:00:00Z"), client));

  const draft = await savePost(post("trash-draft", "trash-draft", "draft", "invalid-date"), client);
  await trashPost(draft.id, client);
  await restorePost(draft.id, client);
  assert.equal((await listPosts({ page: 1, limit: 10, publishedOnly: true }, client)).posts.some((item) => item.id === draft.id), false);
});
