# Family Flashcards

A mobile-first web app that helps extended family members learn each other's
names and faces before a reunion. The app code is public; family data lives in
a separate repo and is encrypted at rest, so the data repo can also be public
without exposing names, photos, or relationships to anyone who doesn't have
the password.

Live app: `https://<your-domain>/family-flashcards/?data=<data-source>`

## How it works

The app fetches one file from a data repo:

- `<family>.enc.json` — AES-256-GCM ciphertext of the family payload
  (`familyName` + `ancestor` ID + `people` array). The encryption key is
  derived from the family password via PBKDF2 (SHA-256, 600,000 iterations).

The password is held in memory only during the decrypt attempt. It's never
written to local storage, session storage, cookies, or anywhere else. Refresh
the page and you'll need to re-enter it.

Photos live in the data repo with random 6-character hex filenames. The
mapping from photo to person is inside the encrypted payload, so a scraper
who finds the photos folder gets a pile of decontextualized images.

## URL forms

The `?data=` parameter accepts four shapes:

| Form | Fetches | Photos resolved against |
|---|---|---|
| `owner/repo` | `https://owner.github.io/repo/data.enc.json` | `https://owner.github.io/repo/` |
| `owner/repo/family` | `https://owner.github.io/repo/family.enc.json` | `https://owner.github.io/repo/` |
| `https://host/path/` (trailing slash) | `https://host/path/data.enc.json` | `https://host/path/` |
| `https://host/path/family` (no slash) | `https://host/path/family.enc.json` | `https://host/path/` |

The full-URL forms are what you want when the data is served from a custom
domain (e.g. `capitos.com`) instead of `<user>.github.io`, or for local
development.

## Setting up a data repo

You only need to do this once per data repo. You can host multiple families
in a single repo using the multi-family layout below.

1. **Create a public GitHub repo.** Suggested naming: `reunion-data` for a
   multi-family repo.

2. **Enable GitHub Pages.** In the repo: Settings → Pages → Source: deploy
   from branch `main` / root. Save.

3. **Add `robots.txt`** at the repo root:
   ```
   User-agent: *
   Disallow: /
   ```

4. **Generate a fine-grained Personal Access Token** (see the
   [Admin tool](#admin-tool) section below).

5. **Create your first family** through the admin tool (see below).

### Multi-family layout

One repo can host multiple families. Each family has its own `.enc.json`
and its own photo folder. The admin tool maintains this layout
automatically as you create new families:

```
reunion-data/
  frist.enc.json
  photos/frist/
    a3f7c2.jpg
    b9e1d4.jpg
  lecropane.enc.json
  photos/lecropane/
    f7e2a8.jpg
    c4b1d9.jpg
  robots.txt
```

Share different links for different families:
- `?data=mikecapito/reunion-data/frist`
- `?data=mikecapito/reunion-data/lecropane`

Each family can have its own password — the password is just the decryption
key for its specific `.enc.json`.

## Admin tool

`admin.html` is a mobile-friendly tool for creating and editing families
directly from a phone. Family members text the admin photos and details;
the admin opens the tool and pushes the updated encrypted data back to the
repo in a single commit.

### One-time setup: create a GitHub Personal Access Token

The admin tool commits to the data repo via the GitHub API, so it needs a
token with write access.

1. On GitHub: **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. **Resource owner**: your GitHub username (or org, if the repo belongs to
   one).
3. **Repository access**: "Only select repositories", and pick **only the
   data repo** (e.g. `reunion-data`). Don't grant access to anything else.
4. **Repository permissions** → **Contents: Read and write**. Leave everything
   else as "No access".
5. Set an expiration that suits you (90 days is reasonable; you can
   regenerate later).
6. Generate and copy the token. It starts with `github_pat_…`.

The token only ever travels to `api.github.com`. The admin tool stores it
in `localStorage` on the admin's device after the first successful login,
so the admin doesn't have to retype it. A **Forget token** link on the
login screen clears it.

### Creating a new family

1. Open `https://<your-domain>/family-flashcards/admin.html?data=<owner>/<repo>`
   (point at the repo, no family slug — or point at a slug that doesn't
   exist yet and the tool will offer to create it).
2. Tap **Create new family**.
3. Fill in:
   - **Family display name** — what's shown after decrypt (e.g. "The Frist
     Family Reunion 2026").
   - **Family slug** — used as the filename. Auto-suggested from the
     display name; lowercase letters, numbers, and hyphens only.
   - **Family password** (twice).
   - **GitHub repo** and **PAT** — pre-filled if you've used the tool
     before.
4. Tap **Create family**. You'll land on an empty people list with a
   "New family — not yet published" banner.
5. Add the first person via the **+** button — they become the ancestor
   shown on the home screen by default.
6. Add as many more people as you like, then tap **Save & Publish**. The
   tool re-encrypts the payload, generates a fresh `<slug>.enc.json`,
   uploads any new photos, and commits everything in one atomic commit
   labeled "Create new family: <Display Name>".

**Save the URL and password somewhere accessible** (a password manager
works well). The URL is `https://<your-domain>/family-flashcards/?data=<owner>/<repo>/<slug>`.
Share it with the family along with the password — through separate
channels if you can.

### Editing an existing family

1. Open `admin.html?data=<same as the main app URL>`.
2. Enter the family password + GitHub PAT, tap **Unlock**.
3. Tap a row to edit, or **+** to add a new person.
4. On the edit screen:
   - Tap **Choose photo** to pick from your camera roll or take a new
     photo. The tool resizes to 600×600 JPEG client-side.
   - Fill in name, birthday, fun fact.
   - Expand a relationship section to add grandparents/parents/etc. The
     picker lets you pick from existing family members (linked) or type
     a free-text name for someone not in the system.
   - Tap **Save** to return to the list. The change is staged but not
     yet published.
5. When you're done with a batch of edits, tap **Save & Publish**. The
   tool commits the updated `.enc.json` and any new photos in a single
   atomic commit.

### Notes on photos

- Photos are saved to `photos/<family>/<random-hex>.jpg` within the data
  repo and referenced by that path from the encrypted blob.
- Old photos are not deleted when a person's photo is replaced — they
  stay in the repo's history. Cleanup is a future feature.
- HEIC photos from iOS work in Safari on modern iPhones (Safari decodes
  them transparently into the canvas). On other browsers, the tool
  shows a clear error and you can re-export as JPEG.

### When something goes wrong

- "Token invalid or doesn't have access to this repo" → Either the PAT
  is expired, mistyped, or doesn't include this repo in its scope.
  Regenerate a fine-grained token with **Contents: read/write** on the
  data repo.
- "A family with this slug already exists" → Pick a different slug, or
  use the unlock flow if you actually want to edit the existing one.
- A publish fails halfway → All your pending changes stay in memory.
  Fix the underlying issue (most often a stale tab where another
  commit landed in the meantime) and try **Save & Publish** again.
- The family password is never written to localStorage. If you refresh
  the page, you'll need to enter it again. The PAT *is* stored so you
  don't have to keep retyping it.

## Local development

The app uses `fetch()` to load the data over HTTPS, which means opening
`index.html` directly with `file://` will not work (the browser blocks
`fetch()` against `file://` origins).

### Option A: real GitHub Pages data repo

Set up a data repo as above, then serve the app locally:
```sh
python3 -m http.server 8000
```
and visit `http://localhost:8000/?data=<owner>/<repo>/<family>`.

### Option B: local data folder

Use the full-URL form of `?data=`. Drop a test data folder somewhere your
local server can reach and point at it:
```
http://localhost:8000/?data=http://localhost:8000/test-data/family1
```
The folder must contain `family1.enc.json` (and a `family1/` photos folder
if your plaintext references photos there).

## Files

- `index.html` — main app entry point
- `app.js` — main app logic (data loading, decrypt, screens)
- `styles.css` — main app styles
- `admin.html`, `admin.js`, `admin.css` — admin tool (login, create
  family, edit people, atomic publish via GitHub API)
- `robots.txt` — keep crawlers out of the app domain
