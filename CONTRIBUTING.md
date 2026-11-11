# Contributing

Please read and understand this guide carefully before contributing to AI Mentor. It outlines the steps to prepare, validate, and submit your changes effectively.

## Get started

1. Fork [Deepak3699/Ai_Mentor](https://github.com/Deepak3699/Ai_Mentor) and clone your fork:

   ```bash
   git clone https://github.com/<your-username>/Ai_Mentor.git
   cd Ai_Mentor
   ```

2. Add the original repository as the `upstream` remote:

   ```bash
   git remote add upstream https://github.com/Deepak3699/Ai_Mentor.git
   git remote -v
   ```

3. Keep your local base branch up to date with upstream. Fetch and integrate the latest changes daily, and always do this before starting new work. Replace `<base-branch>` with the branch you are contributing against, such as `main` or `dev`:

   ```bash
   git fetch upstream
   git switch <base-branch>
   git pull --ff-only upstream <base-branch>
   git push origin <base-branch>
   ```

   If the fast-forward update fails, your local branch may have diverged. Resolve that before continuing; do not force-push to the upstream repository.

4. Review the documentation for the application you plan to contribute to. Each guide covers its architecture, technologies, configuration, and local development setup:

   - [BACKEND](./backend/BACKEND_DOCUMENTATION.md)
   - [BACKEND ADMIN](./backendAdmin/backendAdmin_Documentation.md)
   - [FRONTEND](./frontend/FRONTEND_DOCUMENTATION.md)
   - [FRONTEND ADMIN](./frontendAdmin/FRONTEND_ADMIN_DOCUMENTATION.md)
   - [AI SERVICE](./ai_service/README.md)

   Then install project dependencies:

   ```bash
   npm run setup
   ```

5. Configure the required environment variables using the `.env.example` files and [`initalSetup.md`](initalSetup.md). Never commit `.env` files or credentials.

## Make changes

- Create a descriptive branch from the updated base branch, such as `feat/course-search` or `fix/login-validation`.
- Keep each change focused and consistent with the conventions of the service you are editing.
- Include or update tests and documentation when relevant.
- Avoid unrelated formatting changes and generated files.

## Validate your changes

Run the checks relevant to your changes before opening a pull request:

```bash
npm run format:check
npm run lint
npm test
```

For AI service changes, run the Python tests from `ai_service/`:

```bash
cd ai_service
python -m pytest
```

For frontend changes, run the production build for the affected application:

```bash
npm run build --prefix frontend
npm run build --prefix frontendAdmin
```

If a check cannot be run, explain why in your pull request. Confirm that your changes do not include credentials, environment files, generated media, or build output.

## Commit messages

Use short, descriptive commit messages in the `type: description` format:

```text
feat: add course search
fix: handle expired login tokens
docs: update setup instructions
test: cover course enrollment
```

Common types include `feat`, `fix`, `docs`, `test`, `refactor`, and `chore`. Keep commits coherent and avoid combining unrelated changes.

## Submit a pull request

A pull request (PR) presents your proposed changes for review. A clear description and a focused, well-tested change help reviewers understand your work and make review more efficient.

Before submitting:

1. Write code that is clear and consistent with the surrounding project.
2. Organize your work into coherent commits that make the change easy to follow.
3. Review your own changes for correctness, scope, and accidental files.
4. Run the relevant tests, linters, formatters, and builds.
5. Open a PR against the appropriate project branch.

In your PR description:

- Summarize the problem and the reason for the change.
- Explain the approach and any important design decisions.
- Mention differences from the original plan, if applicable.
- Call out open questions or areas where you would like reviewer input.
- Include screenshots or recordings for user-facing changes. For UI changes, show the relevant updated screens and note any important interaction changes.
- List the checks you ran and their results. Be accurate about anything you did not test.

Use GitHub Markdown to keep the description easy to read. Put questions about specific code in a review comment on the relevant lines when possible. Respond to feedback constructively and update the PR description if the scope or validation changes.

## AI use policy and guidelines

AI tools may help you understand the codebase, write code, or improve wording. You are responsible for every change you submit, whether or not you used an AI tool. You must understand the changes, explain why they are appropriate, and verify them with relevant tests. Do not submit AI-generated code that you have not personally reviewed and tested.

### Using AI as a coding assistant

- Become familiar with the relevant part of the project before asking an AI tool to suggest or change code.
- Verify AI-generated explanations against project documentation and source code. AI tools can be wrong about how the project works.
- Treat generated code, commands, and recommendations as suggestions. Check their correctness, compatibility, security, and behavior before using them.
- Break work into focused, reviewable changes and coherent commits, even if a tool produces a large change at once.
- Avoid comments that merely restate what the code already makes clear. Keep necessary comments concise and accurate.

### Using AI for project communication

Use your own judgment and words when communicating with maintainers. AI tools may help with spelling, grammar, or translation, but read and verify all generated text before posting it. Do not paste generic AI-generated responses to review feedback; explain your reasoning directly.

PR descriptions should focus on the motivation, important design choices, and validation rather than repeating details already visible in the diff. Keep communication concise and accurate, and complete any PR template without replacing its checklist or requested information with generated text.

## Security

Never commit passwords, API keys, tokens, private keys, or other sensitive information. If a real secret is exposed, rotate it with the relevant provider and notify the maintainers. Do not report security vulnerabilities in public issues; contact the project maintainers privately.

For local setup and project-service details, see [`README.md`](README.md) and [`initalSetup.md`](initalSetup.md).
