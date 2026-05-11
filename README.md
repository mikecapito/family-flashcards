# Family Flashcards

A mobile-first web app that helps extended family members learn each other's
names and faces before a reunion. The app code is public; family data lives in
a separate repo and is encrypted at rest, so the data repo can also be public
without exposing names, photos, or relationships to anyone who doesn't have
the password.

Live app: `https://<your-github-username>.github.io/family-flashcards/?data=<owner>/<data-repo>`

## How it works

The app fetches two files from a data repo:

- `config.json` — plaintext, just the family name (used as the password
  screen heading).
- `data.enc.json` — AES-256-GCM ciphertext of the family payload (ancestor
  ID + people array). The encryption key is derived from the family password
  via PBKDF2 (SHA-256, 600,000 iterations).

The password is held in memory only during the decrypt attempt. It's never
written to local storage, session storage, cookies, or anywhere else. Refresh
the page and you'll need to re-enter it.

Photos live in `<data-repo>/photos/` with random 6-character hex filenames.
The mapping from photo to person is inside the encrypted payload, so a
scraper who finds the photos folder gets a pile of decontextualized images.

## Creating a new family data repo

1. **Create a public GitHub repo.** Suggested naming: `reunion-<familyname>`
   (e.g. `reunion-frist`).

2. **Enable GitHub Pages.** In the repo: Settings → Pages → Source: deploy
   from branch `main` / root. Save.

3. **Add `config.json`** at the repo root:
   ```json
   {
     "familyName": "The Frist Family Reunion 2026"
   }
   ```
   This is the only plaintext metadata. Keep it boring — it gets shown on
   the password screen before anyone has authenticated.

4. **Add a `photos/` folder.** Rename each photo to a random
   6-character hex filename (e.g. `a3f7c2.jpg`). On macOS/Linux you can use:
   ```sh
   for f in *.jpg; do
     mv "$f" "$(openssl rand -hex 3).jpg"
   done
   ```
   Keep a private mapping somewhere safe so you remember which photo is
   which when building the JSON in the next step.

5. **Build the plaintext JSON locally.** In a text editor, on your own
   machine, create a file like `plaintext.json` (do NOT commit this):
   ```json
   {
     "ancestor": "eleanor-frist",
     "people": [
       {
         "id": "eleanor-frist",
         "name": "Eleanor Frist",
         "photo": "photos/a3f7c2.jpg",
         "birthday": "1935-03-12",
         "funFact": "Taught herself to play piano at age 60.",
         "syncedAt": null,
         "family": {
           "grandparents": [], "grandparentsRaw": [],
           "parents": [], "parentsRaw": [],
           "siblings": ["george-frist"], "siblingsRaw": ["George Frist"],
           "spouses": [], "spousesRaw": [],
           "children": ["robert-frist"], "childrenRaw": ["Robert Frist"]
         }
       }
     ]
   }
   ```

6. **Encrypt it.** Open `encrypt.html` from this repo in a browser (you can
   download the file and open it locally — it works fully offline). Paste
   the plaintext JSON, enter the family password twice, click **Encrypt**,
   then download `data.enc.json`.

7. **Commit `data.enc.json`** to the data repo root, alongside `config.json`
   and `photos/`.

8. **Add `robots.txt`** at the data repo root:
   ```
   User-agent: *
   Disallow: /
   ```

9. **Share the link** with the family:
   ```
   https://<your-github-username>.github.io/family-flashcards/?data=<your-github-username>/<data-repo-name>
   ```
   Send the password through a separate channel (text, in person, signal,
   whatever — just not the same medium as the link, ideally).

### ⚠️ Never commit the plaintext JSON

The plaintext file (the thing you paste into `encrypt.html`) must never be
committed to the data repo. Once it's in git history it's effectively
public, and deleting the file in a later commit doesn't help — anyone who
cloned the repo, or any crawler that fetched the file, still has it. Keep
the plaintext on your own machine only.

## Updating a family data repo

To add a new person, fix a typo, or change a photo:

1. Edit your local `plaintext.json`.
2. Re-encrypt with `encrypt.html` using the same password.
3. Commit the new `data.enc.json` (overwriting the old one).

The salt and IV inside the envelope are regenerated on every encrypt, so
two encrypts of the same plaintext produce different ciphertexts. That's
expected and fine.

## Local development

The app uses `fetch()` to load the data repo over HTTPS, which means
opening `index.html` directly with `file://` in a browser will not work
(the browser blocks `fetch()` against `file://` origins).

### Option A: real GitHub Pages data repo

Set up a data repo following the steps above, then visit:
```
http://localhost:8000/?data=<owner>/<repo>
```
…served from the app repo's directory via any static server, e.g.:
```sh
python3 -m http.server 8000
```

### Option B: local data folder

The `?data=` parameter also accepts a full URL ending in `/`. Drop a
test data folder somewhere your local server can reach and point at it:
```
http://localhost:8000/?data=http://localhost:8000/test-data/
```
The folder must contain `config.json` and `data.enc.json` at the same
relative paths. Photos resolve relative to that base URL too.

## Files

- `index.html` — entry point
- `app.js` — all app logic (data loading, decrypt, screens)
- `styles.css` — styles
- `encrypt.html` — standalone offline encryption tool
- `robots.txt` — keep crawlers out of the app domain
