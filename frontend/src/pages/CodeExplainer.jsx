import React, { useState } from "react";
import { explainCode } from "../service/aiService";

const CodeExplainer = () => {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [mode, setMode] = useState("explain");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!code.trim()) {
      setError("Please enter your code first.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await explainCode({
        code,
        language,
        mode,
      });

      setResult(data);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6 bg-canvas-alt">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 text-main">AI Code Explainer</h1>

        <p className="text-muted mb-6">Understand, debug, and improve your code with AI.</p>

        <div className="bg-card border border-border rounded-2xl p-6">
          <label className="block font-semibold mb-2 text-main">Programming Language</label>

          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full border border-border rounded-lg p-3 mb-5 bg-card text-main"
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
            <option value="c">C</option>
          </select>

          <label className="block font-semibold mb-2 text-main">Select Mode</label>

          <div className="flex flex-wrap gap-3 mb-5">
            {["explain", "debug", "optimize"].map((item) => (
              <button
                key={item}
                onClick={() => setMode(item)}
                className={`px-4 py-2 rounded-lg border capitalize ${
                  mode === item
                    ? "bg-teal-500 text-white border-teal-500"
                    : "border-border text-main"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <label className="block font-semibold mb-2 text-main">Your Code</label>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste your code here..."
            rows={12}
            maxLength={20000}
            className="w-full border border-border rounded-lg p-4 font-mono text-sm bg-card text-main"
          />

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-4 px-6 py-3 rounded-lg bg-teal-500 text-white font-semibold disabled:opacity-50"
          >
            {loading ? "Processing..." : "Analyze Code"}
          </button>

          {error && <p className="mt-4 text-red-500">{error}</p>}

          {result && (
            <div className="mt-8 space-y-5 text-main">
              <h2 className="text-2xl font-bold">AI Result</h2>

              {result.summary && (
                <div>
                  <h3 className="font-semibold mb-1">Summary</h3>
                  <p>{result.summary}</p>
                </div>
              )}

              {result.explanation && (
                <div>
                  <h3 className="font-semibold mb-1">Explanation</h3>
                  {Array.isArray(result.explanation) ? (
                    <ul className="list-disc pl-6 space-y-1">
                      {result.explanation.map((item, index) => (
                        <li key={index}>
                          {typeof item === "object" && item !== null ? (
                            <div>
                              {item.line != null && (
                                <p className="font-semibold">Line: {item.line}</p>
                              )}
                              {item.code && (
                                <pre className="overflow-x-auto rounded bg-slate-900 text-white p-2 my-1">
                                  <code>{item.code}</code>
                                </pre>
                              )}
                              {item.explanation && <p>{item.explanation}</p>}
                            </div>
                          ) : (
                            <p>{String(item)}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{result.explanation}</p>
                  )}
                </div>
              )}

              {result.issues && (
                <div>
                  <h3 className="font-semibold mb-1">Issues</h3>
                  {Array.isArray(result.issues) ? (
                    <ul className="list-disc pl-6 space-y-1">
                      {result.issues.map((item, index) => (
                        <li key={index}>
                          {typeof item === "object" && item !== null ? (
                            <div>
                              {item.line != null && (
                                <p className="font-semibold">Line: {item.line}</p>
                              )}
                              {item.problem && <p>{item.problem}</p>}
                              {item.suggestion && (
                                <p>
                                  <strong>Suggestion:</strong> {item.suggestion}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p>{String(item)}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{result.issues}</p>
                  )}
                </div>
              )}

              {result.suggested_code && (
                <div>
                  <h3 className="font-semibold mb-1">Suggested Code</h3>
                  <pre className="overflow-x-auto rounded-lg bg-slate-900 text-white p-4">
                    <code>{result.suggested_code}</code>
                  </pre>
                </div>
              )}

              {result.time_complexity && (
                <p>
                  <strong>Time Complexity:</strong> {result.time_complexity}
                </p>
              )}

              {result.space_complexity && (
                <p>
                  <strong>Space Complexity:</strong> {result.space_complexity}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeExplainer;
