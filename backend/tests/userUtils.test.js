import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensureProfileCompleteness,
  formatFullName,
} from "../utils/userUtils.js";

test("formatFullName handles missing values", () => {
  assert.equal(formatFullName("Neeraj", "Saini"), "Neeraj Saini");
  assert.equal(formatFullName("Neeraj", undefined), "Neeraj");
  assert.equal(formatFullName(undefined, undefined), "");
});

test("ensureProfileCompleteness handles missing and complete users", async () => {
  assert.equal(await ensureProfileCompleteness(null), false);
  let saves = 0;
  const user = {
    firstName: " Neeraj ",
    lastName: " Saini ",
    bio: " Developer ",
    avatar_url: " avatar.png ",
    googleId: null,
    isProfileComplete: false,
    async save() {
      saves += 1;
    },
  };

  assert.equal(await ensureProfileCompleteness(user), true);
  assert.equal(user.isProfileComplete, true);
  assert.equal(saves, 1);
});

test("Google-linked profiles require a password and unchanged state is not saved", async () => {
  let saves = 0;
  const user = {
    firstName: "Neeraj",
    lastName: "Saini",
    bio: "Developer",
    avatar_url: "avatar.png",
    googleId: "google-id",
    password: "",
    isProfileComplete: false,
    async save() {
      saves += 1;
    },
  };

  assert.equal(await ensureProfileCompleteness(user), false);
  assert.equal(saves, 0);
});
