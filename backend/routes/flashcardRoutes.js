import express from "express";
import FlashcardDeck from "../models/FlashcardDeck.js";
import Lesson from "../models/Lesson.js";
import Module from "../models/Module.js";
import { protect } from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import {
  generateFlashcardsSchema,
  updateFlashcardMasterySchema,
} from "../schemas/aiSchema.js";

const router = express.Router();

async function getCourseLessonAccess(req, res, courseId, lessonId) {
  const hasPurchasedCourse = req.user.purchasedCourses?.some(
    (course) => Number(course.courseId) === courseId,
  );

  if (!hasPurchasedCourse) {
    res.status(403).json({ message: "Course not purchased" });
    return false;
  }

  const lesson = await Lesson.findOne({
    where: { id: lessonId },
    include: [{ model: Module, where: { courseId }, required: true }],
    attributes: ["id"],
  });

  if (!lesson) {
    res.status(404).json({ message: "Invalid course or lesson" });
    return false;
  }

  return true;
}

router.get("/:courseId/:lessonId", protect, async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);
    const lessonId = Number(req.params.lessonId);

    if (![courseId, lessonId].every(Number.isSafeInteger) || courseId < 1 || lessonId < 1) {
      return res.status(400).json({ message: "Invalid course or lesson" });
    }

    if (!(await getCourseLessonAccess(req, res, courseId, lessonId))) return;

    const deck = await FlashcardDeck.findOne({
      where: { userId: req.user.id, courseId, lessonId },
    });

    return res.json({ deck });
  } catch (error) {
    console.error("Flashcard deck fetch failed:", error.message);
    return res.status(500).json({ message: "Failed to load flashcards" });
  }
});

router.post("/", protect, validate(generateFlashcardsSchema), async (req, res) => {
  try {
    const courseId = Number(req.body.courseId);
    const lessonId = Number(req.body.lessonId);

    if (!(await getCourseLessonAccess(req, res, courseId, lessonId))) return;

    if (!process.env.AI_SERVICE_URL) {
      return res.status(503).json({ message: "AI service is unavailable" });
    }

    const response = await fetch(`${process.env.AI_SERVICE_URL}/generate-flashcards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: req.body.transcript,
        count: Number(req.body.count),
      }),
    });

    if (!response.ok) {
      return res.status(502).json({ message: "Flashcard generation failed" });
    }

    const generatedCards = await response.json();
    if (
      !Array.isArray(generatedCards) ||
      generatedCards.length !== Number(req.body.count) ||
      generatedCards.some(
        (card) =>
          !Number.isInteger(card.id) ||
          typeof card.front !== "string" ||
          typeof card.back !== "string" ||
          typeof card.hint !== "string",
      )
    ) {
      return res.status(502).json({ message: "AI service returned invalid flashcards" });
    }

    const cards = generatedCards.map((card, index) => ({
      id: index + 1,
      front: card.front,
      back: card.back,
      hint: card.hint,
      mastered: false,
    }));

    const [deck, created] = await FlashcardDeck.findOrCreate({
      where: { userId: req.user.id, courseId, lessonId },
      defaults: { cards },
    });

    if (!created) {
      deck.cards = cards;
      await deck.save();
    }

    return res.status(201).json({ deck });
  } catch (error) {
    console.error("Flashcard generation failed:", error.message);
    return res.status(500).json({ message: "Failed to generate flashcards" });
  }
});

router.patch(
  "/:deckId/cards/:cardId",
  protect,
  validate(updateFlashcardMasterySchema),
  async (req, res) => {
    try {
      const cardId = Number(req.params.cardId);
      if (!Number.isSafeInteger(cardId) || cardId < 1) {
        return res.status(400).json({ message: "Invalid flashcard" });
      }

      const deck = await FlashcardDeck.findOne({
        where: { id: req.params.deckId, userId: req.user.id },
      });

      if (!deck) {
        return res.status(404).json({ message: "Flashcard deck not found" });
      }

      const hasPurchasedCourse = req.user.purchasedCourses?.some(
        (course) => Number(course.courseId) === Number(deck.courseId),
      );
      if (!hasPurchasedCourse) {
        return res.status(403).json({ message: "Course not purchased" });
      }

      const cardExists = deck.cards.some((card) => card.id === cardId);
      if (!cardExists) {
        return res.status(404).json({ message: "Flashcard not found" });
      }

      deck.cards = deck.cards.map((card) =>
        card.id === cardId ? { ...card, mastered: req.body.mastered } : card,
      );
      deck.changed("cards", true);
      await deck.save();

      return res.json({ deck });
    } catch (error) {
      console.error("Flashcard mastery update failed:", error.message);
      return res.status(500).json({ message: "Failed to update flashcard" });
    }
  },
);

export default router;
