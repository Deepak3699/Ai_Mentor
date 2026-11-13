# AI Provider Research for AI Mentor

## Free, low-cost, open-source, and self-hosted options for educational content generation

**Repository:** [asmita-durugkar/Ai_Mentor](https://github.com/asmita-durugkar/Ai_Mentor)  
**Research date:** 11 November 2026  
**Document type:** Provider landscape and architecture evaluation  
**Status:** Research shortlist — validate quotas, model availability, licences, and commercial terms before production use.

---

## 1. Executive summary

AI Mentor is intended to support educational-content workflows such as syllabus-based learning material, quizzes, flashcards, lesson scripts, narration, and generated videos. No single provider is the best choice for every stage. A practical architecture should combine:

1. **Hosted LLM APIs** for reliable structured generation during development.
2. **Local/open-weight LLMs** as optional fallbacks when hardware permits.
3. **Document parsing and OCR** to turn uploaded syllabi and PDFs into clean text.
4. **Local speech tools** for transcription and narration where feasible.
5. **A video-composition tool** to assemble generated scripts, narration, images, and captions.
6. **Optional generative video models** for short visual clips, not as the only way to create lessons.

### Recommended shortlist

| AI Mentor capability                        | First option to evaluate   | Alternative                      | Why it is on the shortlist                                             |
| ------------------------------------------- | -------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| Quiz, flashcard, summary, lesson generation | Gemini API                 | Groq-hosted models               | Hosted APIs, structured generation, straightforward integration        |
| Provider/model experimentation              | OpenRouter                 | Hugging Face Inference Providers | One API surface or model catalogue for experiments                     |
| Local LLM inference                         | Ollama + Qwen-family model | llama.cpp                        | Self-hosted inference; no per-token API bill, but hardware is required |
| PDF and syllabus extraction                 | Docling                    | PaddleOCR + PyMuPDF              | Local document processing; useful for tables and scanned pages         |
| Speech-to-text                              | Whisper / faster-whisper   | Groq Whisper API                 | Local option and hosted alternative                                    |
| Text-to-speech                              | Piper                      | Kokoro                           | Local narration without per-character hosted API charges               |
| Image generation                            | FLUX.1 [schnell]           | Stable Diffusion family          | Downloadable models; check model-specific licence                      |
| Video generation                            | Wan 2.2                    | Current LTX model family         | Open model weights/code; GPU requirements remain material              |
| Video assembly                              | FFmpeg                     | MoviePy                          | Deterministic composition of narration, images, subtitles, and clips   |
| Audio editing                               | Audacity                   | FFmpeg                           | Free editing and conversion tools                                      |

**Important distinction:** “Free API”, “free web app”, “open-source code”, and “open model weights” are not interchangeable. A downloadable model may still require expensive GPU hardware. A free API tier may have low rate limits, queueing, data-use terms, or restrictions on commercial use.

---

## 2. Evaluation methodology

Providers are assessed against the needs of an educational platform rather than general chatbot quality.

### Evaluation criteria

- **Capability fit:** Can the provider produce structured quizzes, flashcards, summaries, scripts, narration, or media?
- **API availability:** Is there a documented API or only a consumer-facing website?
- **Free access:** Is there a recurring free quota, limited trial, free model weight, or no-cost local runtime?
- **Deployment model:** Hosted API, hosted application, downloadable weights, or local software.
- **Integration effort:** SDK/REST support, Python compatibility, output schemas, and operational complexity.
- **Reliability:** Rate limits, queueing, service-level commitments, and fallback options.
- **Privacy:** Whether prompts or uploaded content may be retained or used to improve services.
- **Licence and commercial use:** Code licence, model-weight licence, output terms, and any separate restrictions.

### Free-access labels used in this report

| Label                        | Meaning                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| Recurring free API tier      | Provider documents an ongoing free allowance, usually with limits       |
| Limited free credits / trial | Temporary or capped credits; not an ongoing free service                |
| Free web app                 | Consumer interface may be free; API access is not implied               |
| Open-source software         | Software source is available under a stated licence                     |
| Open weights                 | Model weights can be downloaded; usage terms still apply                |
| Self-hosted                  | The application/model runs on infrastructure controlled by the operator |
| Paid / no confirmed free API | Do not plan on ongoing free API usage without confirming current terms  |

Quotas change frequently. Where a provider's account dashboard determines the actual limit, this report deliberately avoids inventing a universal request count.

---

## 3. Large language models (LLMs)

LLMs are the core generation layer for syllabus explanations, summaries, question generation, flashcards, lesson plans, and educational scripts.

### 3.1 Provider comparison

| Provider                                                                                    | Access model                          | Free access status                                                                 | Main strengths                                                                          | Limitations / checks                                                                                               | AI Mentor suitability                                  |
| ------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| [Google Gemini API](https://ai.google.dev/gemini-api/docs/pricing)                          | Hosted API; AI Studio                 | Recurring free tier for selected models, subject to limits                         | Multimodal capabilities, structured generation support, broad SDK support               | Free-tier model availability and rate limits vary; Google states free-tier content may be used to improve products | **High** — primary hosted candidate                    |
| [Groq](https://console.groq.com/docs/overview)                                              | Hosted inference API                  | Free developer access with model-specific limits; verify account dashboard         | Fast inference, OpenAI-compatible API patterns for many workloads, hosted speech models | Rate limits vary by model and organisation; limits can change                                                      | **High** — fast alternative/fallback                   |
| [Mistral AI](https://docs.mistral.ai/)                                                      | Hosted API and model ecosystem        | Free experimentation tier may be available; confirm current account plan           | Strong multilingual and general-purpose model options                                   | Free plan is intended for experimentation; verify model access and limits                                          | Medium-high — evaluate for multilingual content        |
| [OpenRouter](https://openrouter.ai/pricing)                                                 | Multi-provider API gateway            | Free plan lists free models and a request cap; paid models are usage-billed        | Compare multiple model providers through one interface                                  | Free models can have stricter rate limits and availability; gateway is another dependency                          | **High** — useful for model comparison and experiments |
| [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/pricing) | Hosted inference routing              | Free accounts receive a small monthly credit allowance, subject to change          | Large model catalogue and common SDKs                                                   | Small free credit is not a production allowance; model/provider availability varies                                | Medium — testing and model discovery                   |
| [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/)     | Hosted inference                      | Free allocation documented as 10,000 Neurons/day; some models require paid billing | Model catalogue, edge platform integration                                              | Neurons are compute units, not a fixed number of requests; model cost varies                                       | Medium-high — consider if already using Cloudflare     |
| [Cohere](https://cohere.com/)                                                               | Hosted API                            | Trial/development access may be limited; confirm current terms                     | Embeddings, reranking, retrieval-oriented components                                    | Do not assume unlimited free production use                                                                        | Medium — useful for RAG/search components              |
| [Anthropic Claude API](https://docs.anthropic.com/)                                         | Hosted API                            | Do not assume a recurring free API tier                                            | Strong instruction following and long-form writing                                      | API usage is generally paid; check current pricing                                                                 | High quality candidate if budget permits               |
| [OpenAI API](https://platform.openai.com/docs/pricing)                                      | Hosted API                            | Do not assume ChatGPT Free access includes API credits                             | Structured outputs and broad developer tooling                                          | API billing is separate from ChatGPT plans                                                                         | High quality candidate if budget permits               |
| [DeepSeek API](https://api-docs.deepseek.com/)                                              | Hosted API                            | Do not assume a recurring free API tier                                            | Reasoning and coding-oriented models                                                    | API pricing, availability, data policy, and terms need current verification                                        | Candidate for benchmark comparison                     |
| [Ollama](https://ollama.com/) + [Qwen models](https://ollama.com/library)                   | Local runtime and downloadable models | Software/runtime and many model weights can be used locally; compute is not free   | Local privacy/control, no hosted per-token charge                                       | Requires compatible RAM/VRAM, model downloads, and local operations                                                | **High** — optional local fallback                     |
| [llama.cpp](https://github.com/ggml-org/llama.cpp)                                          | Local inference runtime               | Open-source runtime                                                                | Quantized model inference on CPU/GPU, broad hardware support                            | Setup and model selection require technical work                                                                   | Medium-high — resource-constrained deployments         |

### 3.2 Free API facts worth recording

- **Gemini:** Google's pricing documentation lists a free tier for selected models and explicitly distinguishes it from paid production access. It also states that free-tier content may be used to improve Google products. Review the data-use terms before sending private student records or sensitive documents.
- **Groq:** The official rate-limit documentation describes limits using RPM, RPD, TPM, TPD, and audio-specific measures. Exact limits are model- and organisation-dependent; inspect the account's Limits page rather than copying a static quota into application code.
- **OpenRouter:** Its pricing page lists free models and a free-plan request cap. Free model traffic has separate rate limits; do not design a production service around the free plan alone.
- **Hugging Face:** Its current pricing documentation lists a small monthly credit for free accounts. Treat this as experimentation credit, not a meaningful production allocation.
- **Cloudflare Workers AI:** Its pricing documentation describes 10,000 Neurons/day in the free allocation. A Neuron is a usage unit, so actual request capacity depends on the model and workload.
- **Local models:** “No API charge” does not mean “zero operating cost”. Hardware, electricity, storage, deployment, monitoring, and maintenance still cost money.

### 3.3 Recommended LLM selection for AI Mentor

**Primary hosted candidate: Gemini API**

Use for:

- Syllabus-based summaries and explanations.
- Question and answer generation.
- Flashcards and revision notes.
- Lesson scripts and learning objectives.
- JSON-shaped outputs, subject to schema validation.

**Fast hosted alternative: Groq**

Use for:

- Lower-latency generation where the selected model performs adequately.
- A fallback path when the primary provider is unavailable or rate-limited.
- Speech transcription if the required model and account quota are available.

**Local alternative: Ollama + a suitable Qwen model**

Use for:

- Offline or privacy-sensitive experiments.
- Development/testing without sending prompts to a hosted provider.
- A fallback where suitable local hardware exists.

Do not assume that all three providers return identical output. Build a provider adapter and test each model against the same educational evaluation set.

### 3.4 Structured output and quality controls

For every generated educational object, require a stable schema. Example quiz item:

```json
{
  "question": "What is the primary purpose of an operating system?",
  "options": [
    "Manage computer hardware and software resources",
    "Compile every source program",
    "Design database schemas",
    "Create network cables"
  ],
  "correct_answer": "Manage computer hardware and software resources",
  "explanation": "An operating system manages hardware resources and provides services to applications.",
  "difficulty": "beginner",
  "topic": "Operating Systems"
}
```

Recommended validation:

1. Parse the response as JSON; reject malformed output.
2. Validate against a schema (for example, Pydantic or JSON Schema).
3. Check that the correct answer is one of the options.
4. Check for duplicate questions and duplicate options.
5. Check that explanations support the answer.
6. Store source syllabus/page references where possible.
7. Do not present model-generated facts as verified textbook facts without review.

---

## 4. AI video generation

Video generation should be treated as an optional visual layer. A complete educational video can often be assembled more cheaply and predictably from a script, narration, diagrams, captions, and still images.

### 4.1 Provider/model comparison

| Provider / model                                        | Deployment                                                 | Free access status                                                                    | Capabilities                                                                                         | Main constraints                                                                | AI Mentor suitability                            |
| ------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| [Wan 2.2](https://github.com/Wan-Video/Wan2.2)          | Open model weights; self-hosted or hosted by third parties | Weights/code available; inference hardware or hosting costs apply                     | Text-to-video and image-to-video; repository documents a 5B model with 720p/24fps capability         | GPU memory, generation time, setup, and model-specific compute requirements     | **High for research**, not a lightweight default |
| [LTX model family](https://github.com/Lightricks/LTX-2) | Open code/weights with separate model terms                | Model weights available subject to the applicable community licence; hosting may cost | Video generation; current LTX release describes synchronized audio/video and multi-shot capabilities | Check current model/weight licence; older LTX-Video repository is legacy        | **High for evaluation**                          |
| [ComfyUI](https://github.com/comfyanonymous/ComfyUI)    | Local node-based workflow application                      | Free/open-source application                                                          | Orchestrates image/video model workflows                                                             | Not itself a video model; model downloads and GPU compute required              | High as an experimentation interface             |
| [Hugging Face Spaces](https://huggingface.co/spaces)    | Hosted public demos                                        | Some public demos are free, with availability/queue limits                            | Quick model testing                                                                                  | Not a stable production API or guaranteed uptime                                | Medium — demos only                              |
| [Runway](https://runwayml.com/)                         | Hosted platform/API offerings                              | Free access/credits may vary by plan and promotion                                    | Commercial creative video workflows                                                                  | Do not assume free API access; check plan and API terms                         | Evaluate only if budget allows                   |
| [Kling AI](https://klingai.com/)                        | Hosted platform                                            | Free credits/allowances can change                                                    | Text/image-to-video                                                                                  | API access, region availability, quota, and commercial rights need confirmation | Evaluate only after terms check                  |
| [Google Veo](https://deepmind.google/models/veo/)       | Hosted product/API access varies                           | Do not assume a free production API                                                   | High-quality generative video                                                                        | Access, pricing, model availability, and commercial rights depend on product    | Future candidate                                 |
| [OpenAI Sora](https://openai.com/sora/)                 | Hosted product                                             | Product access does not imply free API access                                         | Generative video                                                                                     | Verify API availability, plan, limits, and rights independently                 | Future candidate                                 |

### 4.2 Important licence and version notes

- **Wan 2.2:** Its official repository states that the models are under Apache 2.0. Review the full licence and usage terms before deployment.
- **LTX:** The older `LTX-Video` repository identifies itself as legacy and points new projects to LTX-2.5. The current code and model weights have separate licence terms. Do not apply the old repository's licence assumptions to the current weights.
- **ComfyUI:** It is a workflow tool, not a hosted generative-video API. Its output depends on the models, nodes, and checkpoints installed.
- **Hosted products:** A free web interface or free credits do not establish a free API or unrestricted commercial usage.

### 4.3 Recommendation

For AI Mentor, first build **script-to-video composition**:

1. Generate a lesson script.
2. Generate or retrieve narration.
3. Create slides/diagrams or select approved images.
4. Add subtitles and section titles.
5. Compose the assets with FFmpeg.
6. Optionally insert short Wan/LTX-generated clips where they genuinely improve learning.

This path is more controllable than relying on a generative video model to produce an entire lesson accurately.

---

## 5. Text-to-speech (TTS)

TTS converts lesson scripts into spoken narration.

| Provider / tool                                                                | Deployment                          | Free access status                                                                            | Strengths                                                 | Limitations / checks                                                                                              | Suitability             |
| ------------------------------------------------------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------- |
| [Piper](https://github.com/OHF-Voice/piper1-gpl)                               | Local neural TTS                    | Open-source local software; no hosted API charge                                              | Lightweight local inference and voice choices             | Current maintained project and each voice/model's licence must be checked; voice quality/language coverage varies | **High**                |
| [Kokoro](https://github.com/hexgrad/kokoro)                                    | Open-weight model / local inference | Model weights available; local compute required                                               | Natural-sounding narration for supported languages/voices | Check exact model and distribution licences, hardware, and language support                                       | **High for evaluation** |
| [Google Cloud Text-to-Speech](https://cloud.google.com/text-to-speech/pricing) | Hosted API                          | Pricing includes product-specific free allowances for some voices/usage; verify current terms | Managed service, voice variety, scalable API              | Quotas and charges depend on voice/model and character usage                                                      | Medium-high             |
| [Coqui TTS](https://github.com/coqui-ai/TTS)                                   | Local toolkit                       | Open-source toolkit; model licences vary                                                      | Custom TTS experimentation                                | Project maintenance and model/voice licences need checking                                                        | Medium                  |
| [ElevenLabs](https://elevenlabs.io/pricing)                                    | Hosted API/platform                 | Limited free plan may be offered; API quotas and commercial terms differ by plan              | Expressive voices and narration                           | Free plan is not automatically suitable for commercial product usage                                              | Medium                  |
| [Audacity](https://www.audacityteam.org/)                                      | Desktop audio editor                | Free/open-source software                                                                     | Trim, clean, and normalize generated narration            | Editing tool, not a TTS engine                                                                                    | High as supporting tool |

### TTS recommendation

Evaluate Piper and Kokoro using the same 60–90 second educational script. Score:

- Pronunciation of technical terms.
- Indian English and relevant language support.
- Natural pacing and pauses.
- Voice consistency.
- Generation time and memory use.
- Licence of both the engine and selected voice.

Do not select a voice model based only on a short demo. Test real syllabus terminology and longer narration.

---

## 6. Speech-to-text (STT)

STT can support lecture transcription, audio notes, spoken questions, and accessibility features.

| Provider / tool                                                     | Deployment                     | Free access status                                              | Strengths                                                               | Limitations / checks                                                                | Suitability |
| ------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------- |
| [OpenAI Whisper](https://github.com/openai/whisper)                 | Local model                    | Code and weights under MIT; local compute required              | Multilingual transcription, language identification, speech translation | Larger models can be slow and resource-intensive; accuracy depends on audio quality | **High**    |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper)         | Local optimized implementation | Open-source software; local compute required                    | Efficient Whisper inference using CTranslate2                           | Hardware and quantization affect speed/accuracy                                     | **High**    |
| [Groq speech-to-text](https://console.groq.com/docs/speech-to-text) | Hosted API                     | Account/model-specific free limits may apply                    | Fast hosted transcription; documented audio endpoints                   | Audio duration, file size, and model limits apply; check current dashboard          | High        |
| [Deepgram](https://deepgram.com/)                                   | Hosted API                     | Trial credits may be available; not a permanent free assumption | Streaming and transcription APIs                                        | Trial limits and production prices must be checked                                  | Medium      |
| [AssemblyAI](https://www.assemblyai.com/)                           | Hosted API                     | Trial access may be available                                   | Transcription and audio intelligence features                           | Check current free allowance and usage terms                                        | Medium      |

### STT recommendation

Use Whisper/faster-whisper for local testing and compare it with Groq's hosted transcription endpoint. Evaluate:

- Word error rate (WER) on representative lecture audio.
- Hindi/English code-switching and other target languages.
- Technical vocabulary recognition.
- Punctuation and paragraph segmentation.
- Processing time per audio minute.
- Performance on noisy recordings.

Do not promise a language or accuracy level without testing it on representative audio.

---

## 7. Image generation

Images can support diagrams, concept illustrations, lesson thumbnails, and visual explanations. For technical subjects, generated images should not replace accurate labelled diagrams unless they are reviewed.

| Provider / model                                                                            | Deployment                               | Free access status                                                | Strengths                                                                   | Licence / constraints                                                    | Suitability      |
| ------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------- |
| [FLUX.1 [schnell]](https://huggingface.co/black-forest-labs/FLUX.1-schnell)                 | Open weights / local or hosted inference | Downloadable weights; local compute or hosted inference costs     | Apache 2.0 model licence listed by Black Forest Labs; fast image generation | Hardware and output review required                                      | **High**         |
| [Stable Diffusion](https://stability.ai/license)                                            | Open weights / local or hosted inference | Some model families are available under community terms           | Broad ecosystem, local tooling, fine-tuning                                 | Licence differs by model/version and use case; review Stability AI terms | High             |
| [ComfyUI](https://github.com/comfyanonymous/ComfyUI)                                        | Local workflow UI                        | Free/open-source application                                      | Repeatable image workflows and model integration                            | Workflow app, not a model or hosted API                                  | High             |
| [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/pricing) | Hosted inference                         | Small free-account credit; pay-as-you-go after allowance          | Model discovery and API-based experiments                                   | Free credit is limited and subject to change                             | Medium           |
| [Pollinations](https://pollinations.ai/)                                                    | Hosted service                           | Free access may be available; service terms and limits can change | Convenient experimentation                                                  | Verify API stability, rate limits, privacy, and commercial rights        | Experimental     |
| [Google Imagen](https://ai.google.dev/)                                                     | Hosted model/API availability varies     | Do not assume a free API allowance                                | Managed image-generation quality                                            | Check model availability and pricing separately from Gemini text models  | Future candidate |

### Image recommendation

For a self-hosted experiment, evaluate FLUX.1 [schnell] and a suitable Stable Diffusion checkpoint. FLUX.1 [schnell] is listed under Apache 2.0 by the model publisher; other FLUX variants can have different licences. Never assume all checkpoints in a model family share the same terms.

For educational diagrams, consider deterministic SVG/HTML diagram generation where exact labels, arrows, equations, and layouts matter. Text-to-image models can misspell labels or invent details.

---

## 8. Document processing, PDF extraction, and OCR

Document ingestion is a foundational part of syllabus-based generation. Extracted text should retain page numbers, headings, reading order, and table structure wherever possible.

| Provider / tool                                                                                              | Deployment             | Free access status                                                          | Strengths                                                            | Limitations / checks                                                                                    | Suitability   |
| ------------------------------------------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------- |
| [Docling](https://github.com/docling-project/docling)                                                        | Local Python toolkit   | MIT-licensed code; local compute required                                   | PDF/document parsing, structured output, tables, Markdown conversion | Complex layouts and scanned PDFs need validation; individual model licences may differ                  | **Very high** |
| [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)                                                       | Local toolkit          | Apache 2.0 project                                                          | OCR and document parsing; broad language support                     | Model selection and hardware affect performance                                                         | **Very high** |
| [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)                                                  | Local OCR engine       | Open-source software                                                        | Mature OCR engine; useful for scanned pages                          | Layout/table reconstruction is limited without additional processing                                    | High          |
| [PyMuPDF](https://pymupdf.readthedocs.io/)                                                                   | Local Python library   | Free/open-source options; verify AGPL/commercial licensing for intended use | Fast PDF text and page extraction                                    | Licence choice matters for proprietary/commercial distribution                                          | High          |
| [Marker](https://github.com/VikParuchuri/marker)                                                             | Local / hosted options | Source and model terms must be checked                                      | PDF-to-Markdown and structured conversion                            | Model weights have separate terms and commercial-use restrictions; not a blanket free commercial option | Medium-high   |
| [Google Document AI](https://cloud.google.com/document-ai/pricing)                                           | Hosted API             | Product-specific free usage may be available; verify pricing                | Managed OCR and structured extraction                                | Usage charges and processor-specific availability                                                       | Medium        |
| [Azure AI Document Intelligence](https://azure.microsoft.com/products/ai-services/ai-document-intelligence/) | Hosted API             | Free tier/trial may be available; verify current quota                      | Managed extraction and layout analysis                               | Paid usage beyond free allowance                                                                        | Medium        |

### Document-processing recommendation

Start with Docling for document structure and add PaddleOCR or Tesseract for scanned pages as needed. Use a page-aware ingestion pipeline:

1. Accept PDF/DOCX input.
2. Detect whether pages contain embedded text or scanned images.
3. Extract text and layout.
4. Run OCR only where required.
5. Preserve page number, heading, table, and section metadata.
6. Clean headers/footers without deleting meaningful content.
7. Split content by semantic sections rather than arbitrary character count.
8. Store source references with generated summaries and questions.
9. Let users inspect extracted text before generation when extraction confidence is low.

**Quality warning:** OCR can misread mathematical symbols, subscripts, chemical formulae, tables, and multi-column layouts. Add a review step for those materials.

---

## 9. Audio and music generation

Background music is optional for educational lessons. Prioritize speech clarity and accessibility over music.

| Provider / tool                                                              | Deployment                    | Free access status                                           | Strengths                                         | Licence / constraints                                                        | Suitability                             |
| ---------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------- |
| [Meta AudioCraft / MusicGen](https://github.com/facebookresearch/audiocraft) | Local model                   | Code is MIT; MusicGen model weights are CC-BY-NC 4.0         | Text- and melody-conditioned music generation     | Non-commercial model-weight licence; do not assume commercial use is allowed | Research only unless rights are cleared |
| [Stable Audio](https://stability.ai/license)                                 | Hosted and model options vary | Access depends on model and plan                             | Audio and sound generation                        | Model-specific licence and commercial conditions apply                       | Evaluate only after licence review      |
| [Audacity](https://www.audacityteam.org/)                                    | Desktop                       | Free/open-source software                                    | Editing, noise reduction, trimming, normalization | Not a generative model                                                       | **High**                                |
| [FFmpeg](https://ffmpeg.org/)                                                | Local command-line tool       | Free software; build configuration/licence should be checked | Audio conversion, mixing, normalization, muxing   | Not a generative model                                                       | **Very high**                           |

For commercial educational content, use properly licensed music and sound effects. MusicGen's code licence and model-weight licence are different; the model weights' CC-BY-NC 4.0 terms are a material commercial-use restriction.

---

## 10. Video composition and media infrastructure

Generative video models create clips. A production educational video still needs deterministic editing, captions, transitions, narration synchronization, and export.

| Tool                                        | Purpose                                | Free status                                | Role in AI Mentor                              |
| ------------------------------------------- | -------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| [FFmpeg](https://ffmpeg.org/)               | Video/audio processing and composition | Free software; check build licence         | **Recommended core media engine**              |
| [MoviePy](https://github.com/Zulko/moviepy) | Python video editing                   | Open-source Python library                 | Alternative for Python-based editing workflows |
| [Remotion](https://www.remotion.dev/)       | Programmatic video with React          | Free options and separate commercial terms | Useful if video templates are built with React |
| [OpenShot](https://www.openshot.org/)       | Desktop video editing                  | Free/open-source editor                    | Manual review and editing                      |
| [Shotcut](https://shotcut.org/)             | Desktop video editing                  | Free/open-source editor                    | Manual review and editing                      |

### Suggested video pipeline

`Lesson content → script → TTS narration → visuals/slides → subtitles → FFmpeg composition → MP4`

Recommended controls:

- Keep narration and subtitles synchronized.
- Generate captions from the final narration, not only from the initial script.
- Include a title card, section transitions, and end summary.
- Use a consistent resolution and frame rate.
- Store source assets and generated output separately.
- Preserve attribution and licence metadata for third-party media.

---

## 11. RAG and retrieval components

For syllabus-grounded answers, retrieval can reduce unsupported model claims by supplying relevant source passages to the LLM. RAG does not guarantee factual correctness; retrieval quality and citation validation remain necessary.

| Component              | Candidate                                                                   | Free/self-hosted option                     | Use                                     |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------- |
| Embeddings             | [Sentence Transformers](https://www.sbert.net/)                             | Open-source library and downloadable models | Convert syllabus chunks into vectors    |
| Embeddings API         | [Google embedding models](https://ai.google.dev/gemini-api/docs/embeddings) | Check model-specific free and paid terms    | Hosted embedding generation             |
| Vector database        | [Chroma](https://www.trychroma.com/)                                        | Open-source local deployment                | Store and retrieve document chunks      |
| Vector database        | [FAISS](https://github.com/facebookresearch/faiss)                          | Open-source local library                   | Similarity search                       |
| Vector database        | [Qdrant](https://qdrant.tech/)                                              | Open-source self-hosted option              | Persistent vector search                |
| Reranking              | [Cohere Rerank](https://cohere.com/rerank)                                  | Trial access may be limited                 | Reorder retrieved passages by relevance |
| Reranking/local models | Hugging Face cross-encoder models                                           | Downloadable models; hardware required      | Local reranking                         |

### RAG workflow

1. Extract and normalize syllabus content.
2. Split content into topic-aware chunks.
3. Store chunk text with page, section, document, and subject metadata.
4. Create embeddings.
5. Retrieve the top relevant chunks for a user question.
6. Optionally rerank retrieved chunks.
7. Ask the LLM to answer only from the supplied context when the task requires syllabus-grounded answers.
8. Return page/section citations.
9. If evidence is insufficient, say so instead of fabricating an answer.

---

## 12. Architecture recommendation for AI Mentor

### 12.1 Recommended logical architecture

```text
                ┌─────────────────────────┐
                │       AI Mentor UI      │
                │ Upload • Learn • Quiz   │
                └────────────┬────────────┘
                             │
                ┌────────────▼────────────┐
                │     Backend / API       │
                │ Auth • Jobs • Validation│
                └───────┬─────────┬───────┘
                        │         │
             ┌──────────▼───┐  ┌──▼────────────────┐
             │ Document     │  │ LLM Provider      │
             │ ingestion    │  │ adapter           │
             │ Docling/OCR  │  │ Gemini/Groq/local │
             └──────┬───────┘  └──┬────────────────┘
                    │             │
             ┌──────▼─────────────▼──────┐
             │ Source chunks / RAG       │
             │ Metadata • page references│
             └──────────────┬────────────┘
                            │
             ┌──────────────▼────────────┐
             │ Structured content        │
             │ Quiz • Flashcards • Notes │
             │ Lesson scripts            │
             └──────────────┬────────────┘
                            │
             ┌──────────────▼────────────┐
             │ Media generation          │
             │ TTS • images • FFmpeg     │
             │ optional video models     │
             └──────────────┬────────────┘
                            │
             ┌──────────────▼────────────┐
             │ Storage / delivery        │
             │ Database • object storage │
             └───────────────────────────┘
```

This is a recommended logical design, not a claim that every box already exists in the current repository.

### 12.2 Provider adapter pattern

Avoid hard-coding one provider's request and response format throughout the application. Use a common internal interface:

```python
class LLMProvider:
    def generate(self, prompt: str, response_schema: dict | None = None):
        raise NotImplementedError
```

Implement provider-specific adapters for the selected providers. Normalize:

- Model identifier.
- Input/output format.
- Token usage.
- Latency.
- Error type.
- Rate-limit response.
- Retry eligibility.
- Provider request ID.

Never expose API keys in frontend code or commit them to Git. Load credentials from environment variables or a secret manager.

### 12.3 Fallback policy

A sensible fallback sequence is:

1. Call the primary provider.
2. Retry transient network errors with bounded exponential backoff.
3. If a rate limit is returned, respect `Retry-After` where supplied.
4. Switch to a configured secondary provider only if its output schema and quality have been tested.
5. If all providers fail, show a clear error and preserve the user's input.

Do not silently change models for high-stakes educational answers without logging the selected provider/model.

---

## 13. Evaluation and benchmarking plan

Run a controlled benchmark before choosing a provider. Use the same input set and rubric for every model.

### 13.1 LLM evaluation set

Create at least:

- 20 syllabus summary tasks.
- 30 multiple-choice question-generation tasks.
- 20 flashcard-generation tasks.
- 10 lesson-script tasks.
- 10 ambiguous or insufficient-context questions.

### 13.2 Suggested metrics

| Metric               | How to evaluate                                   | Why it matters                        |
| -------------------- | ------------------------------------------------- | ------------------------------------- |
| Factual correctness  | Human review against syllabus/reference           | Prevent incorrect learning material   |
| Syllabus coverage    | Map output to required topics                     | Avoid missing key learning objectives |
| Question validity    | Check unambiguous question and one correct answer | Improve quiz quality                  |
| Distractor quality   | Review incorrect options for plausibility         | Avoid trivial or misleading MCQs      |
| Explanation quality  | Check explanation supports correct answer         | Improve learning value                |
| JSON/schema validity | Automated schema validation                       | Reduce application failures           |
| Latency              | Measure end-to-end response time                  | User experience                       |
| Cost per task        | Record tokens/audio seconds/image/video usage     | Estimate operating cost               |
| Failure rate         | Track timeouts, 429s, malformed output            | Reliability                           |
| Groundedness         | Check claims against retrieved source passages    | Reduce hallucination                  |
| Language quality     | Human review in target languages                  | Accessibility                         |

### 13.3 Suggested scoring rubric

Score each candidate from 1 to 5 for:

- Factual correctness: 30%
- Syllabus relevance and coverage: 20%
- Output structure: 15%
- Explanation quality: 15%
- Latency: 10%
- Cost: 10%

Keep licence/privacy compliance as a **pass/fail gate**, not a weighted score. A cheap provider that cannot meet the project's privacy or usage requirements should not win the evaluation.

---

## 14. Security, privacy, accessibility, and responsible-use considerations

1. **API keys:** Store secrets server-side. Never place keys in browser bundles, source control, screenshots, or public logs.
2. **Student data:** Avoid sending personal identifiers or sensitive records to third-party models unless the service terms, consent, and applicable law permit it.
3. **Provider data policies:** Check retention, training use, region, subprocessors, and deletion controls for each API plan.
4. **Uploaded documents:** Validate file type and size; scan uploads; protect against malicious or malformed files.
5. **Prompt injection:** Treat uploaded documents and retrieved passages as untrusted content. They must not override system instructions or request secrets.
6. **Output validation:** Validate model output before saving or rendering it.
7. **Educational accuracy:** Provide source references and encourage review for high-impact learning content.
8. **Accessibility:** Support captions, readable contrast, keyboard navigation, and text alternatives to audio/video.
9. **Copyright:** Check licences for model weights, voice models, datasets, music, images, and generated assets.
10. **Auditability:** Record provider/model version, prompt template version, generation timestamp, and source-document references where appropriate.

---

## 15. Cost-control recommendations

- Use a smaller/cheaper model for routine summaries and flashcards; reserve stronger models for complex reasoning or quality review.
- Set maximum output-token limits and reject unnecessarily long generations.
- Cache repeated syllabus extraction and embeddings.
- Batch offline generation where the provider supports it.
- Generate narration only after the user approves the script.
- Reuse approved diagrams and lesson assets.
- Use local OCR/TTS/STT when hardware and operational costs make sense.
- Add per-user and per-feature usage budgets.
- Monitor cost per completed lesson, not only cost per API call.
- Provide graceful degradation when free quotas are exhausted.

---

## 16. Final recommendations and implementation priority

| Priority | Component                    | Recommended candidate                                          | Reason                                                   |
| -------- | ---------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| P0       | LLM generation               | Keep/evaluate Gemini as primary; benchmark Groq as alternative | Core feature and quickest value                          |
| P0       | Structured output validation | Pydantic / JSON Schema                                         | Required for reliable quizzes and flashcards             |
| P0       | PDF ingestion                | Docling                                                        | Foundational for syllabus-based content                  |
| P0       | Source traceability          | Page/section metadata in stored chunks                         | Enables grounded answers and review                      |
| P1       | STT                          | Whisper/faster-whisper; compare Groq hosted STT                | Supports lecture/audio workflows                         |
| P1       | TTS                          | Piper and Kokoro benchmark                                     | Supports narrated lessons without mandatory hosted usage |
| P1       | Video composition            | FFmpeg                                                         | Reliable deterministic video assembly                    |
| P2       | Image generation             | FLUX.1 [schnell] or licensed Stable Diffusion checkpoint       | Adds illustrations and thumbnails                        |
| P2       | RAG                          | Chroma or Qdrant + Sentence Transformers                       | Improves source-grounded retrieval                       |
| P3       | Generative video             | Wan 2.2 and current LTX model family                           | Compute-heavy optional enhancement                       |
| P3       | Music generation             | Only after licence review                                      | Non-essential to core learning experience                |

### Recommended initial stack

For a cost-conscious prototype:

- **LLM:** Gemini API, with Groq as a tested alternative.
- **Document parsing:** Docling; OCR fallback using PaddleOCR or Tesseract.
- **Retrieval:** Sentence Transformers + Chroma or Qdrant.
- **TTS:** Piper or Kokoro after voice/licence tests.
- **STT:** faster-whisper.
- **Video:** FFmpeg.
- **Image generation:** FLUX.1 [schnell] for local experiments, subject to compute availability and licence checks.

This stack is a recommendation for evaluation, not a claim that every service is free at production scale. A production deployment should budget for hosted API use, compute, storage, monitoring, and support.

---

## 17. Official references

The links below are primary documentation or official project repositories wherever available. Pricing pages and model licences should be checked again immediately before implementation or commercial release.

### LLMs and inference

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API documentation](https://ai.google.dev/gemini-api/docs)
- [Groq documentation](https://console.groq.com/docs/overview)
- [Groq rate limits](https://console.groq.com/docs/rate-limits)
- [Mistral documentation](https://docs.mistral.ai/)
- [OpenRouter pricing](https://openrouter.ai/pricing)
- [Hugging Face Inference Providers pricing](https://huggingface.co/docs/inference-providers/pricing)
- [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Ollama model library](https://ollama.com/library)
- [llama.cpp repository](https://github.com/ggml-org/llama.cpp)
- [OpenAI API pricing](https://platform.openai.com/docs/pricing)
- [Anthropic API documentation](https://docs.anthropic.com/)
- [DeepSeek API documentation](https://api-docs.deepseek.com/)

### Video and image generation

- [Wan 2.2 repository and licence](https://github.com/Wan-Video/Wan2.2)
- [LTX-2 repository](https://github.com/Lightricks/LTX-2)
- [LTX model documentation](https://docs.ltx.io/)
- [ComfyUI repository](https://github.com/comfyanonymous/ComfyUI)
- [Hugging Face Spaces](https://huggingface.co/spaces)
- [FLUX.1 Schnell model card](https://huggingface.co/black-forest-labs/FLUX.1-schnell)
- [Black Forest Labs FLUX documentation](https://github.com/black-forest-labs/flux)
- [Stability AI licence](https://stability.ai/license)

### Speech and audio

- [Piper voice project](https://github.com/OHF-Voice/piper1-gpl)
- [Kokoro repository](https://github.com/hexgrad/kokoro)
- [OpenAI Whisper repository and MIT licence](https://github.com/openai/whisper)
- [faster-whisper repository](https://github.com/SYSTRAN/faster-whisper)
- [Groq speech-to-text documentation](https://console.groq.com/docs/speech-to-text)
- [Google Cloud Text-to-Speech pricing](https://cloud.google.com/text-to-speech/pricing)
- [Meta AudioCraft repository](https://github.com/facebookresearch/audiocraft)
- [MusicGen model card and licence](https://github.com/facebookresearch/audiocraft/blob/main/model_cards/MUSICGEN_MODEL_CARD.md)
- [Audacity](https://www.audacityteam.org/)

### Documents, OCR, and media processing

- [Docling repository and MIT licence](https://github.com/docling-project/docling)
- [PaddleOCR repository and Apache 2.0 licence](https://github.com/PaddlePaddle/PaddleOCR)
- [Tesseract OCR repository](https://github.com/tesseract-ocr/tesseract)
- [Marker repository](https://github.com/VikParuchuri/marker)
- [PyMuPDF documentation](https://pymupdf.readthedocs.io/)
- [Google Document AI pricing](https://cloud.google.com/document-ai/pricing)
- [FFmpeg](https://ffmpeg.org/)
- [MoviePy repository](https://github.com/Zulko/moviepy)

### Retrieval and vector search

- [Sentence Transformers](https://www.sbert.net/)
- [Chroma](https://www.trychroma.com/)
- [FAISS](https://github.com/facebookresearch/faiss)
- [Qdrant](https://qdrant.tech/)
- [Cohere Rerank](https://cohere.com/rerank)

---

## 18. Research limitations and verification checklist

This document is a comparative research baseline, not a contractual pricing quote or a guarantee of availability.

Before selecting a provider, record:

- [ ] Exact model ID and version.
- [ ] Current free-tier eligibility and whether a payment method is required.
- [ ] Current RPM, RPD, TPM, file-size, audio-duration, and concurrency limits.
- [ ] Input/output pricing and any separate image, audio, video, or tool charges.
- [ ] Context window and maximum output size.
- [ ] API availability in the intended deployment region.
- [ ] Prompt/data retention and model-training policy for the exact plan.
- [ ] Commercial-use terms for API outputs.
- [ ] Code licence and model-weight licence separately.
- [ ] Attribution, redistribution, and acceptable-use obligations.
- [ ] Expected latency and quality on AI Mentor's own evaluation set.
- [ ] Fallback behaviour when a free quota is exhausted.

**Last reviewed:** 11 November 2026. Recheck provider documentation before implementation because pricing, free allowances, model names, and licences can change without notice.
