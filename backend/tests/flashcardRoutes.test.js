import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import jwt from "jsonwebtoken";
import FlashcardDeck from "../models/FlashcardDeck.js";
import Lesson from "../models/Lesson.js";
import User from "../models/User.js";
import flashcardRoutes from "../routes/flashcardRoutes.js";

const userId = "00000000-0000-4000-8000-000000000001";
const courseId = 7;
const lessonId = 31;
const tokenSecret = "flashcard-route-test-secret";

test("flashcard routes persist decks and protect mastery by learner", async (t) => {
  const originalFindByPk = User.findByPk;
  const originalLessonFindOne = Lesson.findOne;
  const originalDeckFindOne = FlashcardDeck.findOne;
  const originalFindOrCreate = FlashcardDeck.findOrCreate;
  const originalFetch = globalThis.fetch;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalAiServiceUrl = process.env.AI_SERVICE_URL;
  const cards = Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    front: `Question ${index + 1}?`,
    back: `Answer ${index + 1}.`,
    hint: `Hint ${index + 1}.`,
  }));
  const deck = {
    id: "deck-id",
    userId,
    courseId,
    lessonId,
    cards: cards.map((card) => ({ ...card, mastered: false })),
    changed() {},
    async save() {},
  };

  process.env.JWT_SECRET = tokenSecret;
  process.env.AI_SERVICE_URL = "http://ai-service.test";
  User.findByPk = async () => ({
    id: userId,
    purchasedCourses: [{ courseId }],
    isBlocked: false,
    passwordChangedAt: null,
  });
  Lesson.findOne = async () => ({ id: lessonId });
  FlashcardDeck.findOne = async () => deck;
  FlashcardDeck.findOrCreate = async () => [deck, false];
  globalThis.fetch = async (input, options) => {
    if (String(input).startsWith("http://ai-service.test/")) {
      assert.equal(options.method, "POST");
      return Response.json(cards);
    }
    return originalFetch(input, options);
  };

  const app = express();
  app.use(express.json());
  app.use("/api/flashcards", flashcardRoutes);
  const server = app.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/flashcards`;
  const authorization = `Bearer ${jwt.sign({ id: userId }, tokenSecret)}`;

  try {
    await t.test("fetches only the authenticated learner's deck", async () => {
      const response = await originalFetch(`${baseUrl}/${courseId}/${lessonId}`, {
        headers: { Authorization: authorization },
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.deck.userId, userId);
    });

    await t.test("generates and saves a deck with mastery reset", async () => {
      const response = await originalFetch(baseUrl, {
        method: "POST",
        headers: { Authorization: authorization, "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          lessonId,
          transcript: "A transcript about event loops.",
          count: 5,
        }),
      });
      const body = await response.json();

      assert.equal(response.status, 201);
      assert.equal(body.deck.cards.length, 5);
      assert.equal(body.deck.cards[0].mastered, false);
    });

    await t.test("persists the mastery toggle on the selected card", async () => {
      const response = await originalFetch(`${baseUrl}/deck-id/cards/2`, {
        method: "PATCH",
        headers: { Authorization: authorization, "Content-Type": "application/json" },
        body: JSON.stringify({ mastered: true }),
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.deck.cards[1].mastered, true);
    });

    await t.test("rejects learners without course access", async () => {
      User.findByPk = async () => ({
        id: userId,
        purchasedCourses: [],
        isBlocked: false,
        passwordChangedAt: null,
      });

      const response = await originalFetch(`${baseUrl}/${courseId}/${lessonId}`, {
        headers: { Authorization: authorization },
      });

      assert.equal(response.status, 403);
    });
  } finally {
    server.close();
    await once(server, "close");
    User.findByPk = originalFindByPk;
    Lesson.findOne = originalLessonFindOne;
    FlashcardDeck.findOne = originalDeckFindOne;
    FlashcardDeck.findOrCreate = originalFindOrCreate;
    globalThis.fetch = originalFetch;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    if (originalAiServiceUrl === undefined) delete process.env.AI_SERVICE_URL;
    else process.env.AI_SERVICE_URL = originalAiServiceUrl;
  }
});
