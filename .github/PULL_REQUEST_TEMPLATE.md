## What does this change?

Describe it in two to four lines. Cover both *what* changed and *why*.

## Which issue does this close?

<!-- Example: Closes #12
     Writing "Closes #12" closes the issue automatically when this merges. -->

Closes #

## How did you test this?

List the steps so a reviewer can repeat them:

1.
2.
3.

## Screenshot or recording

Required for any UI change. Please include before and after.
Terminal output is fine for backend or CLI work.

## Checklist

Tick every box before requesting a review.

- [ ] `npm run lint` passes locally (run it from the repo root)
- [ ] I ran the affected service locally and confirmed the change works
- [ ] No `.env` file or API key is included in this pull request
- [ ] `console.log`, `debugger` and commented-out code have been removed
- [ ] Any new dependencies are added to `package.json` (or `requirements.txt`)
- [ ] Documentation is updated if the API or setup changed
- [ ] Errors are handled — the user sees a message, not a blank screen
- [ ] Checked on mobile or smaller screens, if this is a UI change

## Notes for the reviewer

Anything that needs a closer look? Any shortcut taken? Any open question?

---

**Branch naming:** `type/short-description`
Examples: `fix/admin-port` · `feat/certificate-download` · `docs/setup-guide`

**Commit message format:** `type: description`
Example: `fix: point admin frontend to port 5001`
Types: `feat` · `fix` · `docs` · `style` · `refactor` · `test` · `chore`
