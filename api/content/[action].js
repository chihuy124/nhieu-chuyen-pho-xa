const { createRouteDispatcher } = require("../../lib/route-dispatch");

module.exports = createRouteDispatcher({
  page: require("../../lib/api-content/page"),
  post: require("../../lib/api-content/post"),
  posts: require("../../lib/api-content/posts"),
  promo: require("../../lib/api-content/promo"),
  settings: require("../../lib/api-content/settings"),
});
