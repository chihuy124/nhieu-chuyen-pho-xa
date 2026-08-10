const crypto = require("crypto");
const { getKv } = require("./kv");
const { FIXED_LOGO_URL } = require("./site-assets");
const kv = getKv();

const ALL_POSTS_INDEX = "content:posts:all";
const PUBLISHED_POSTS_INDEX = "content:posts:published";
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
    const next = { ...post, updatedAt: new Date().toISOString() };
    const slugOwner = await client.get(slugKey(next.slug));
    if (slugOwner && slugOwner !== next.id) throw new Error("Slug đã được sử dụng bởi bài viết khác");

    await client.set(postKey(next.id), next);
    await client.set(slugKey(next.slug), next.id);
    await client.zadd(ALL_POSTS_INDEX, { score, member: next.id });
    if (next.status === "published") {
      await client.zadd(PUBLISHED_POSTS_INDEX, { score, member: next.id });
    } else {
      await client.zrem(PUBLISHED_POSTS_INDEX, next.id);
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
  return parseStored(await client.get(postKey(id)));
}

async function getPostBySlug(slug, client = kv) {
  const id = await client.get(slugKey(slug));
  return id ? getPost(id, client) : null;
}

async function listPosts({ page = 1, limit = 12, publishedOnly = false } = {}, client = kv) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 12));
  const start = (safePage - 1) * safeLimit;
  const index = publishedOnly ? PUBLISHED_POSTS_INDEX : ALL_POSTS_INDEX;
  const [ids, total] = await Promise.all([
    client.zrange(index, start, start + safeLimit - 1, { rev: true }),
    client.zcard(index),
  ]);
  const posts = ids.length ? (await client.mget(...ids.map(postKey))).map(parseStored).filter(Boolean) : [];
  return { posts, page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) };
}

async function deletePost(id, client = kv) {
  const existing = await getPost(id, client);
  if (!existing) return false;
  await Promise.all([
    client.del(postKey(id)),
    client.del(slugKey(existing.slug)),
    client.zrem(ALL_POSTS_INDEX, id),
    client.zrem(PUBLISHED_POSTS_INDEX, id),
  ]);
  return true;
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
  savePost,
  saveSettings,
};
