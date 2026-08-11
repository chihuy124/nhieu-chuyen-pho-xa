const crypto = require("crypto");
const { buildPostPermalink, decodeWordPressSlug } = require("./content");
const { getKv } = require("./kv");
const { FIXED_LOGO_URL } = require("./site-assets");
const kv = getKv();

const ALL_POSTS_INDEX = "content:posts:all";
const PUBLISHED_POSTS_INDEX = "content:posts:published";
const TRASHED_POSTS_INDEX = "content:posts:trashed";
const SETTINGS_KEY = "content:site-settings";

const DEFAULT_SETTINGS = Object.freeze({
  siteTitle: "Nhiều Chuyện Đường Phố",
  siteDescription: "Chuyện đường phố, video và những câu chuyện đáng chú ý mỗi ngày.",
  fanpageUrl: "",
  logoUrl: FIXED_LOGO_URL,
  promoEnabled: true,
  promoImageUrl: "/assets/promo-10-10.webp",
  defaultTikTokUrl: "https://www.tiktok.com/",
  shopeeEnabled: false,
  shopeeImageUrl: "",
  shopeeUrl: "",
  promoOrder: "tiktok-first",
});

function postKey(id) {
  return `content:post:${id}`;
}

function slugKey(slug) {
  return `content:slug:${String(slug || "").toLowerCase()}`;
}

function parseStored(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch (_error) { return null; }
}

function normalizeStoredPost(value) {
  const post = parseStored(value);
  if (!post || typeof post !== "object" || !post.id || !post.slug) return post;
  const slug = decodeWordPressSlug(post.slug);
  const permalink = buildPostPermalink(slug, post.publishedAt);
  if (slug === post.slug && permalink === post.permalink) return post;
  return { ...post, slug, permalink };
}

function slugVariants(value) {
  const raw = String(value || "").trim();
  const decoded = decodeWordPressSlug(raw);
  return [...new Set([raw, decoded, encodeURIComponent(decoded)].filter(Boolean))];
}

async function withPostSlugLock(id, client, operation) {
  const initial = await getPost(id, client);
  if (!initial) return operation(null);
  const key = `content:lock:slug:${String(initial.slug).toLowerCase()}`;
  const token = crypto.randomBytes(10).toString("hex");
  const acquired = await client.set(key, token, { nx: true, ex: 15 });
  if (acquired !== "OK") throw new Error("Bài viết đang được cập nhật, vui lòng thử lại");
  try {
    return operation(await getPost(id, client));
  } finally {
    if (await client.get(key) === token) await client.del(key);
  }
}

async function savePost(post, client = kv) {
  const initialExisting = parseStored(await client.get(postKey(post.id)));
  const slugsToLock = [...new Set([initialExisting?.slug, post.slug].filter(Boolean).map((slug) => String(slug).toLowerCase()))].sort();
  const locks = [];
  try {
    for (const slug of slugsToLock) {
      const key = `content:lock:slug:${slug}`;
      const token = crypto.randomBytes(10).toString("hex");
      const acquired = await client.set(key, token, { nx: true, ex: 15 });
      if (acquired !== "OK") throw new Error("Slug đang được cập nhật, vui lòng thử lại");
      locks.push({ key, token });
    }
    const existing = parseStored(await client.get(postKey(post.id)));
    if (existing?.slug && !slugsToLock.includes(String(existing.slug).toLowerCase())) {
      throw new Error("Bài viết vừa được cập nhật, vui lòng thử lại");
    }
    const score = Number.isFinite(Date.parse(post.publishedAt)) ? Date.parse(post.publishedAt) : Date.now();
    const { deletedAt: _ignoredDeletedAt, ...postWithoutDeletedAt } = post;
    const next = {
      ...postWithoutDeletedAt,
      ...(existing?.deletedAt ? { deletedAt: existing.deletedAt } : {}),
      updatedAt: new Date().toISOString(),
    };
    const slugOwner = await client.get(slugKey(next.slug));
    if (slugOwner && slugOwner !== next.id) throw new Error("Slug đã được sử dụng bởi bài viết khác");

    await client.set(postKey(next.id), next);
    await client.set(slugKey(next.slug), next.id);
    if (next.deletedAt) {
      await client.zrem(ALL_POSTS_INDEX, next.id);
      await client.zrem(PUBLISHED_POSTS_INDEX, next.id);
      await client.zadd(TRASHED_POSTS_INDEX, { score: Date.parse(next.deletedAt), member: next.id });
    } else {
      await client.zrem(TRASHED_POSTS_INDEX, next.id);
      await client.zadd(ALL_POSTS_INDEX, { score, member: next.id });
      if (next.status === "published") {
        await client.zadd(PUBLISHED_POSTS_INDEX, { score, member: next.id });
      } else {
        await client.zrem(PUBLISHED_POSTS_INDEX, next.id);
      }
    }
    if (
      existing?.slug
      && existing.slug !== next.slug
      && await client.get(slugKey(existing.slug)) === next.id
    ) await client.del(slugKey(existing.slug));
    return next;
  } finally {
    for (const lock of [...locks].reverse()) {
      if (await client.get(lock.key) === lock.token) await client.del(lock.key);
    }
  }
}

async function getPost(id, client = kv) {
  return normalizeStoredPost(await client.get(postKey(id)));
}

async function getPostBySlug(slug, client = kv) {
  for (const candidate of slugVariants(slug)) {
    const id = await client.get(slugKey(candidate));
    if (id) {
      const post = await getPost(id, client);
      return post?.deletedAt ? null : post;
    }
  }
  return null;
}

async function listPosts({ page = 1, limit = 12, publishedOnly = false, trashedOnly = false } = {}, client = kv) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 12));
  const start = (safePage - 1) * safeLimit;
  const index = trashedOnly ? TRASHED_POSTS_INDEX : (publishedOnly ? PUBLISHED_POSTS_INDEX : ALL_POSTS_INDEX);
  const [ids, total] = await Promise.all([
    client.zrange(index, start, start + safeLimit - 1, { rev: true }),
    client.zcard(index),
  ]);
  const posts = ids.length ? (await client.mget(...ids.map(postKey))).map(normalizeStoredPost).filter(Boolean) : [];
  return { posts, page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) };
}

async function deletePost(id, client = kv) {
  return withPostSlugLock(id, client, async (existing) => {
    if (!existing) return false;
    const candidateKeys = slugVariants(existing.slug).map(slugKey);
    const owners = candidateKeys.length ? await client.mget(...candidateKeys) : [];
    const ownedSlugKeys = candidateKeys.filter((_key, index) => owners[index] === existing.id);
    const deletions = [
      client.del(postKey(id)),
      client.zrem(ALL_POSTS_INDEX, id),
      client.zrem(PUBLISHED_POSTS_INDEX, id),
      client.zrem(TRASHED_POSTS_INDEX, id),
    ];
    if (ownedSlugKeys.length) deletions.push(client.del(...ownedSlugKeys));
    await Promise.all(deletions);
    return true;
  });
}

async function trashPost(id, client = kv) {
  return withPostSlugLock(id, client, async (existing) => {
    if (!existing) return null;
    if (existing.deletedAt) return existing;
    const deletedAt = new Date().toISOString();
    const next = { ...existing, deletedAt, updatedAt: deletedAt };
    await client.set(postKey(id), next);
    await Promise.all([
      client.zrem(ALL_POSTS_INDEX, id),
      client.zrem(PUBLISHED_POSTS_INDEX, id),
      client.zadd(TRASHED_POSTS_INDEX, { score: Date.parse(deletedAt), member: id }),
    ]);
    return next;
  });
}

async function restorePost(id, client = kv) {
  return withPostSlugLock(id, client, async (existing) => {
    if (!existing) return null;
    if (!existing.deletedAt) return existing;
    const { deletedAt: _deletedAt, ...activePost } = existing;
    const next = { ...activePost, updatedAt: new Date().toISOString() };
    const score = Number.isFinite(Date.parse(next.publishedAt)) ? Date.parse(next.publishedAt) : Date.now();
    await client.set(postKey(id), next);
    await client.zrem(TRASHED_POSTS_INDEX, id);
    await client.zadd(ALL_POSTS_INDEX, { score, member: id });
    if (next.status === "published") {
      await client.zadd(PUBLISHED_POSTS_INDEX, { score, member: id });
    } else {
      await client.zrem(PUBLISHED_POSTS_INDEX, id);
    }
    return next;
  });
}

async function getSettings(client = kv) {
  const stored = parseStored(await client.get(SETTINGS_KEY));
  return { ...DEFAULT_SETTINGS, ...(stored || {}), logoUrl: FIXED_LOGO_URL };
}

async function saveSettings(settings, client = kv) {
  const next = { ...DEFAULT_SETTINGS, ...settings, logoUrl: FIXED_LOGO_URL, updatedAt: new Date().toISOString() };
  await client.set(SETTINGS_KEY, next);
  return next;
}

module.exports = {
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
};
