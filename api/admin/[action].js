const { createRouteDispatcher } = require("../../lib/route-dispatch");

module.exports = createRouteDispatcher({
  crawl: require("../../lib/api-admin/crawl"),
  login: require("../../lib/api-admin/login"),
  logout: require("../../lib/api-admin/logout"),
  post: require("../../lib/api-admin/post"),
  posts: require("../../lib/api-admin/posts"),
  "promo-clicks": require("../../lib/api-admin/promo-clicks"),
  session: require("../../lib/api-admin/session"),
  settings: require("../../lib/api-admin/settings"),
});
