## Repository Hygiene & File Conventions

Before opening a pull request, ensure your working tree only includes tracked source files and intentional configuration updates.

### Environment & Secrets (Never Commit)
* **`.env` / `.env.*`:** Local environment files containing API keys, database URLs, or secret tokens must never be committed.
* **Templates:** Only commit sanitized template files (such as `.env.example`) with placeholder values.

### Runtime & Generated Artifacts (Do Not Commit)
The following directories and files are created locally when running or building the project and are ignored by Git:
* **AI & Media Outputs:** `ai_service/outputs/` and any locally generated audio, video, or image renders.
* **User Uploads & Databases:** Local storage directories (e.g., `uploads/`, `media/`) and local database files (e.g., `*.sqlite3`, `*.db`).
* **Caches & Dependencies:** `__pycache__/`, `.pytest_cache/`, `node_modules/`, `.venv/`, and virtual environment folders.
* **Build Artifacts:** `dist/`, `build/`, `.next/`, or compiled static bundles.

### Pre-PR Hygiene Checklist
- [ ] Run `git status` and verify no `.env` files or API credentials appear in untracked or staged changes.
- [ ] Confirm generated media (`ai_service/outputs/`) and local database/upload files are excluded.
- [ ] Check that only source code, tests, migrations, or sanitized `.env.example` updates are staged.
- [ ] If you added a new runtime folder or config file in your PR, verify its pattern is added to `.gitignore`.
