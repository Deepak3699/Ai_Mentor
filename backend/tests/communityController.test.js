import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { default: CommunityPost } = await import("../models/CommunityPost.js");
const { default: User } = await import("../models/User.js");
const { default: Report } = await import("../models/Report.js");
const { default: AdminNotification } = await import("../models/AdminNotification.js");
const { sequelize } = await import("../config/db.js");
const community = await import("../controllers/communityController.js");

const originals = {
  transaction: sequelize.transaction,
  postFindAll: CommunityPost.findAll,
  postFindAndCountAll: CommunityPost.findAndCountAll,
  postFindByPk: CommunityPost.findByPk,
  postCreate: CommunityPost.create,
  userFindByPk: User.findByPk,
  userFindAll: User.findAll,
  reportFindOne: Report.findOne,
  reportCreate: Report.create,
  reportDestroy: Report.destroy,
  adminNotificationCreate: AdminNotification.create,
};

const response = () => {
  const state = { statusCode: 200, body: undefined, headers: {} };
  return {
    state,
    res: {
      status(code) { state.statusCode = code; return this; },
      json(body) { state.body = body; return this; },
      set(name, value) { state.headers[name] = value; return this; },
    },
  };
};

beforeEach(() => {
  sequelize.transaction = async (callback) => callback({});
  CommunityPost.findAll = async () => [];
  CommunityPost.findAndCountAll = async () => ({ count: 0, rows: [] });
  CommunityPost.findByPk = async () => null;
  CommunityPost.create = async () => { throw new Error("unexpected post create"); };
  User.findByPk = async () => null;
  User.findAll = async () => [];
  Report.findOne = async () => null;
  Report.create = async () => { throw new Error("unexpected report create"); };
  Report.destroy = async () => 0;
  AdminNotification.create = async () => ({});
});

after(() => {
  sequelize.transaction = originals.transaction;
  CommunityPost.findAll = originals.postFindAll;
  CommunityPost.findAndCountAll = originals.postFindAndCountAll;
  CommunityPost.findByPk = originals.postFindByPk;
  CommunityPost.create = originals.postCreate;
  User.findByPk = originals.userFindByPk;
  User.findAll = originals.userFindAll;
  Report.findOne = originals.reportFindOne;
  Report.create = originals.reportCreate;
  Report.destroy = originals.reportDestroy;
  AdminNotification.create = originals.adminNotificationCreate;
});

test("course discussions require enrollment", async () => {
  User.findByPk = async () => ({ purchasedCourses: [{ courseId: 2 }] });
  const { state, res } = response();
  await community.getCourseDiscussions({ user: { id: "u1" }, params: { courseId: "1" }, query: {} }, res);
  assert.equal(state.statusCode, 403);
  assert.equal(state.body.requiresEnrollment, true);
});

test("course discussions sanitize pagination and expose metadata headers", async () => {
  User.findByPk = async () => ({ purchasedCourses: [{ courseId: 1 }] });
  let options;
  CommunityPost.findAndCountAll = async (value) => { options = value; return { count: 21, rows: [{ id: 1 }] }; };
  const { state, res } = response();
  await community.getCourseDiscussions({ user: { id: "u1" }, params: { courseId: "1" }, query: { page: "-2", limit: "0" } }, res);
  assert.deepEqual(options.where, { type: "course", courseId: 1, hiddenAt: null });
  assert.equal(options.limit, 10);
  assert.equal(options.offset, 0);
  assert.deepEqual(state.headers, { "X-Total-Count": 21, "X-Page": 1, "X-Limit": 10, "X-Pages": 3 });
});

test("global discussions filter categories and sort popular results", async () => {
  const posts = [{ id: "low", likes: [] }, { id: "high", likes: [{ userId: "u" }] }];
  let options;
  CommunityPost.findAndCountAll = async (value) => { options = value; return { count: 2, rows: posts }; };
  const { state, res } = response();
  await community.getGlobalDiscussions({ query: { category: "Development", sort: "popular" } }, res);
  assert.deepEqual(options.where, { type: "global", hiddenAt: null, category: "Development" });
  assert.equal(state.body[0].id, "high");
});

test("course post creation rejects users who are not enrolled", async () => {
  User.findByPk = async () => ({ purchasedCourses: [] });
  const { state, res } = response();
  await community.createCommunityPost({ user: { id: "u1" }, body: { type: "course", courseId: 1, courseName: "Course", content: "Question" } }, res);
  assert.equal(state.statusCode, 403);
});

test("global post creation assigns ownership and initializes reactions", async () => {
  let created;
  CommunityPost.create = async (data) => { created = data; return { id: "p1", ...data }; };
  CommunityPost.findByPk = async () => ({ id: "p1", content: "Hello" });
  const { state, res } = response();
  await community.createCommunityPost({ user: { id: "u1" }, body: { type: "global", category: "General", content: "Hello" } }, res);
  assert.equal(state.statusCode, 201);
  assert.equal(created.userId, "u1");
  assert.equal(created.courseId, null);
  assert.deepEqual(created.likes, []);
  assert.deepEqual(created.replies, []);
});

test("editing and deleting posts are restricted to their owner", async () => {
  CommunityPost.findByPk = async () => ({ id: "p1", type: "global", userId: "owner" });
  let outcome = response();
  await community.editCommunityPost({ user: { id: "attacker" }, params: { id: "p1" }, body: { content: "Changed" } }, outcome.res);
  assert.equal(outcome.state.statusCode, 403);
  outcome = response();
  await community.deleteCommunityPost({ user: { id: "attacker" }, params: { id: "p1" } }, outcome.res);
  assert.equal(outcome.state.statusCode, 403);
});

test("deleting an owned post removes reports before destroying the post", async () => {
  const calls = [];
  const post = { id: "p1", type: "global", userId: "owner", async destroy() { calls.push("post"); } };
  CommunityPost.findByPk = async () => post;
  Report.destroy = async ({ where }) => { calls.push(["reports", where]); return 2; };
  const { state, res } = response();
  await community.deleteCommunityPost({ user: { id: "owner" }, params: { id: "p1" } }, res);
  assert.deepEqual(calls, [["reports", { postId: "p1" }], "post"]);
  assert.deepEqual(state.body, { message: "Post deleted successfully" });
});

test("liking toggles the current user and removes a matching dislike", async () => {
  let saves = 0;
  const changed = [];
  const post = {
    id: "p1",
    likes: [],
    dislikes: [{ userId: "u1" }, { userId: "u2" }],
    changed(field, value) { changed.push([field, value]); },
    async save() { saves += 1; },
  };
  let lookup = 0;
  CommunityPost.findByPk = async () => (++lookup === 1 ? post : post);
  const { res } = response();
  await community.likeCommunityPost({ user: { id: "u1" }, params: { id: "p1" } }, res);
  assert.deepEqual(post.likes, [{ userId: "u1" }]);
  assert.deepEqual(post.dislikes, [{ userId: "u2" }]);
  assert.equal(saves, 1);
  assert.deepEqual(changed, [["dislikes", true], ["likes", true]]);
});

test("users cannot report their own post or reply", async () => {
  CommunityPost.findByPk = async () => ({ userId: "u1", replies: [{ id: "r1", userId: "u1" }] });
  let outcome = response();
  await community.reportContent({ user: { id: "u1" }, params: { id: "p1" }, body: { reason: "spam" } }, outcome.res);
  assert.equal(outcome.state.statusCode, 403);
  outcome = response();
  await community.reportContent({ user: { id: "u1" }, params: { id: "p1" }, body: { replyId: "r1", reason: "spam" } }, outcome.res);
  assert.equal(outcome.state.statusCode, 403);
});

test("duplicate reports return conflict without creating another report", async () => {
  CommunityPost.findByPk = async () => ({ userId: "author", replies: [] });
  Report.findOne = async ({ where }) => { assert.deepEqual(where, { reporterId: "u1", postId: "p1", replyId: null }); return { id: "existing" }; };
  let creates = 0;
  Report.create = async () => { creates += 1; };
  const { state, res } = response();
  await community.reportContent({ user: { id: "u1" }, params: { id: "p1" }, body: { reason: "spam" } }, res);
  assert.equal(state.statusCode, 409);
  assert.equal(creates, 0);
});
