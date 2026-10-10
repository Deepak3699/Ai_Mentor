import React from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { fetchMock, toastErrorMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  apiFetch: fetchMock,
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    updateUser: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: toastErrorMock,
    success: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("../service/aiService", () => ({
  getAIVideo: vi.fn(),
}));

vi.mock("../service/aiGeneration", () => ({
  AIGenerationError: class AIGenerationError extends Error {},
  classifyGenerationError: vi.fn(),
  fetchTranscript: vi.fn(),
  pollAIVideoStatus: vi.fn(),
}));

vi.mock("../components/video/VideoPlayer", () => ({
  default: () => <div data-testid="mock-video-player" />,
}));

vi.mock("../components/video/AITranscript", () => ({
  default: () => <div data-testid="mock-ai-transcript" />,
}));

import LearningPage from "../pages/LearningPage";

const makeResponse = (data, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => data,
});

const courseData = {
  id: 1,
  title: "Test Course",
  modules: [
    {
      id: 10,
      title: "Module One",
      lessons: [
        {
          id: 101,
          title: "Lesson One",
          type: "video",
          content: "First lesson content",
        },
        {
          id: 102,
          title: "Lesson Two",
          type: "video",
          content: "Second lesson content",
        },
      ],
    },
  ],
  currentLesson: {
    id: 101,
    title: "Lesson One",
    type: "video",
    content: "First lesson content",
  },
};

const makeQuiz = (lessonId, prefix = `Lesson ${lessonId}`) => ({
  quizSessionId: `session-${lessonId}`,
  lessonId,
  difficulty: "intermediate",
  questions: Array.from({ length: 4 }, (_, index) => ({
    question: `${prefix} question ${index + 1}`,
    topic: `Topic ${index + 1}`,
    options: ["Option A", "Option B", "Option C", "Option D"],
  })),
});

const makeResult = () => ({
  score: 75,
  correctAnswers: 3,
  totalQuestions: 4,
  weakTopics: ["Topic 4"],
  results: [
    {
      correct: true,
      correctAnswer: 0,
      explanation: "Correct explanation",
    },
    {
      correct: true,
      correctAnswer: 1,
      explanation: "Second explanation",
    },
    {
      correct: true,
      correctAnswer: 2,
      explanation: "Third explanation",
    },
    {
      correct: false,
      correctAnswer: 3,
      explanation: "Review this topic again",
    },
  ],
});

function renderLearningPage() {
  return render(
    <MemoryRouter initialEntries={["/courses/1/learning"]}>
      <Routes>
        <Route
          path="/courses/:id/learning"
          element={<LearningPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function openLessonTwo() {
  // The current lesson appears in the breadcrumb and content selector.
  await waitFor(() => {
    expect(screen.getAllByText("Lesson One").length).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getAllByText("Lesson One")[1]);

  fireEvent.click(
    await screen.findByRole("button", { name: /Lesson Two/ }),
  );

  await waitFor(() => {
    expect(screen.getAllByText("Lesson Two").length).toBeGreaterThan(0);
  });
}

async function answerAllQuestions() {
  for (let questionIndex = 1; questionIndex <= 4; questionIndex += 1) {
    const question = await screen.findByText(
      new RegExp(`question ${questionIndex}$`, "i"),
    );

    const questionCard = question.closest(".rounded-xl");
    expect(questionCard).not.toBeNull();

    fireEvent.click(
      questionCard.querySelectorAll("button")[questionIndex - 1],
    );
  }
}

describe("LearningPage adaptive quiz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("token", "test-token");

    fetchMock.mockImplementation(async (url, options = {}) => {
      if (url === "/api/courses/1/learning") {
        return makeResponse(structuredClone(courseData));
      }

      if (url === "/api/ai/generate-quiz") {
        const body = JSON.parse(options.body);
        return makeResponse(makeQuiz(body.lessonId));
      }

      if (url === "/api/ai/submit-quiz") {
        return makeResponse(makeResult());
      }

      return makeResponse({ message: `Unexpected request: ${url}` }, false, 404);
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("generates a quiz for the active lesson and shows its loading state", async () => {
    let resolveQuiz;

    fetchMock.mockImplementation((url) => {
      if (url === "/api/courses/1/learning") {
        return Promise.resolve(makeResponse(structuredClone(courseData)));
      }

      if (url === "/api/ai/generate-quiz") {
        return new Promise((resolve) => {
          resolveQuiz = resolve;
        });
      }

      return Promise.resolve(makeResponse(makeResult()));
    });

    renderLearningPage();

    expect(
      await screen.findByText("Generating your adaptive quiz..."),
    ).toBeTruthy();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ai/generate-quiz",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ courseId: 1, lessonId: 101 }),
        }),
      );
    });

    resolveQuiz(makeResponse(makeQuiz(101, "Initial")));

    expect(await screen.findByText("Initial question 1")).toBeTruthy();
    expect(screen.getByText("intermediate level")).toBeTruthy();
  });

  it("shows a generation error and retries successfully", async () => {
    fetchMock
      .mockImplementationOnce(async () =>
        makeResponse(structuredClone(courseData)),
      )
      .mockImplementationOnce(async () =>
        makeResponse({ message: "Quiz service unavailable" }, false, 503),
      )
      .mockImplementation(async (url, options = {}) => {
        if (url === "/api/ai/generate-quiz") {
          const body = JSON.parse(options.body);
          return makeResponse(makeQuiz(body.lessonId, "Retry"));
        }

        if (url === "/api/courses/1/learning") {
          return makeResponse(structuredClone(courseData));
        }

        return makeResponse(makeResult());
      });

    renderLearningPage();

    expect(
      await screen.findByText("Quiz service unavailable"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Retry question 1")).toBeTruthy();
    expect(
      screen.queryByText("Quiz service unavailable"),
    ).toBeNull();
  });

  it("allows answer selection, submits all answers, and displays feedback", async () => {
    renderLearningPage();

    expect(await screen.findByText("Lesson 101 question 1")).toBeTruthy();

    await answerAllQuestions();

    const submitButton = screen.getByRole("button", {
      name: "Submit Quiz",
    });

    expect(submitButton.disabled).toBe(false);

    fireEvent.click(submitButton);

    expect(await screen.findByText("Quiz completed")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("3 of 4 correct")).toBeTruthy();
    expect(screen.getByText("Areas to improve: Topic 4")).toBeTruthy();
    expect(screen.getByText("Review this topic again")).toBeTruthy();

    const submitCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/ai/submit-quiz",
    );

    expect(submitCall).toBeTruthy();

    const submittedBody = JSON.parse(submitCall[1].body);

    expect(submittedBody).toEqual({
      courseId: 1,
      lessonId: 101,
      quizSessionId: "session-101",
      answers: [0, 1, 2, 3],
    });
  });

  it("does not let a stale quiz response overwrite the newly selected lesson", async () => {
    let resolveFirstQuiz;
    let resolveSecondQuiz;

    fetchMock.mockImplementation((url, options = {}) => {
      if (url === "/api/courses/1/learning") {
        return Promise.resolve(makeResponse(structuredClone(courseData)));
      }

      if (url === "/api/ai/generate-quiz") {
        const { lessonId } = JSON.parse(options.body);

        return new Promise((resolve) => {
          if (lessonId === 101) {
            resolveFirstQuiz = resolve;
          } else if (lessonId === 102) {
            resolveSecondQuiz = resolve;
          }
        });
      }

      return Promise.resolve(makeResponse(makeResult()));
    });

    renderLearningPage();

    await waitFor(() => {
      expect(resolveFirstQuiz).toBeTypeOf("function");
    });

    await openLessonTwo();

    await waitFor(() => {
      expect(resolveSecondQuiz).toBeTypeOf("function");
    });

    // The new lesson's request finishes first.
    resolveSecondQuiz(makeResponse(makeQuiz(102, "Current lesson")));

    expect(
      await screen.findByText("Current lesson question 1"),
    ).toBeTruthy();

    // A late response from the old lesson must be ignored.
    resolveFirstQuiz(makeResponse(makeQuiz(101, "Stale lesson")));

    await waitFor(() => {
      expect(screen.getByText("Current lesson question 1")).toBeTruthy();
      expect(screen.queryByText("Stale lesson question 1")).toBeNull();
    });
  });
});
