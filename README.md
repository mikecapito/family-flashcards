# Family Flashcards

A mobile-first web app that helps extended family members learn each other's
names and faces before a reunion. The app code is public; family data lives in
a separate repo and is encrypted at rest, so the data repo can also be public
without exposing names, photos, or relationships to anyone who doesn't have
the password.

Live app: `https://<your-github-username>.github.io/family-flashcards/?data=<data-source>`
(see "URL forms" below)

## How it works

The app fetches one file from a data repo:

- `<family>.enc.json` — AES-256-GCM ciphertext of the family payload
  (`familyName` + `ancestor` ID + `people` array). The encryption key is
  derived from the family password via PBKDF2 (SHA-256, 600,000 iterations).

The password is held in memory only during the decrypt attempt. It's never
written to local storage, session storage, cookies, or anywhere else. Refresh
the page and you'll need to re-enter it.

Photos live alongside the `.enc.json` with random 6-character hex filenames.
The mapping from photo to person is inside the encrypted payload, so a
scraper who finds the photos folder gets a pile of decontextualized images.

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

## Creating a new family data repo

1. **Create a public GitHub repo.** Suggested naming: `reunion-<familyname>`
   for a single-family repo, or just `reunion` for a multi-family repo.

2. **Enable GitHub Pages.** In the repo: Settings → Pages → Source: deploy
   from branch `main` / root. Save.

3. **Add a photos folder.** Use the family name as the folder name:
   ```
   reunion/
     frist/
       a3f7c2.jpg
       b9e1d4.jpg
       ...
   ```
   Rename each photo to a random 6-character hex filename. On macOS/Linux:
   ```sh
   for f in *.jpg; do
     mv "$f" "$(openssl rand -hex 3).jpg"
   done
   ```
   Keep a private mapping somewhere safe so you remember which photo is
   which when building the JSON in the next step.

4. **Build the plaintext JSON locally.** In a text editor, on your own
   machine, create a file like `frist-plaintext.json` (do NOT commit this):
   ```json
   {
     "familyName": "The Frist Family Reunion 2026",
     "ancestor": "eleanor-frist",
     "people": [
       {
         "id": "eleanor-frist",
         "name": "Eleanor Frist",
         "photo": "frist/a3f7c2.jpg",
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
   Photo paths are relative to the repo root, so they should include the
   family folder prefix (e.g. `frist/a3f7c2.jpg`).

5. **Encrypt it.** Open `encrypt.html` in a browser (you can download the
   file and open it locally — it works fully offline). Paste the plaintext
   JSON, enter the family password twice, click **Encrypt**, then download
   `data.enc.json`.

6. **Rename and commit.** Rename the downloaded file to `<family>.enc.json`
   (e.g. `frist.enc.json`) and commit it to the data repo alongside the
   `frist/` photos folder.

7. **Add `robots.txt`** at the data repo root:
   ```
   User-agent: *
   Disallow: /
   ```

8. **Share the link.** For a multi-family repo:
   ```
   https://<your-github-username>.github.io/family-flashcards/?data=<owner>/<repo>/<family>
   ```
   For a single-family repo (where the file is `data.enc.json`):
   ```
   https://<your-github-username>.github.io/family-flashcards/?data=<owner>/<repo>
   ```
   Send the password through a separate channel (text, in person, Signal,
   whatever — just not the same medium as the link, ideally).

### Multi-family layout

One repo can host multiple families. Each family has its own `.enc.json`
and its own photo folder:

```
reunion/
  frist.enc.json
  frist/
    a3f7c2.jpg
    b9e1d4.jpg
  lecropane.enc.json
  lecropane/
    f7e2a8.jpg
    c4b1d9.jpg
  robots.txt
```

Then share different links for different families:
- `?data=mikecapito/reunion/frist`
- `?data=mikecapito/reunion/lecropane`

Each family can have its own password — the password is just the decryption
key for its specific `.enc.json`.

### ⚠️ Never commit the plaintext JSON

The plaintext file (the thing you paste into `encrypt.html`) must never be
committed to the data repo. Once it's in git history it's effectively
public, and deleting the file in a later commit doesn't help — anyone who
cloned the repo, or any crawler that fetched the file, still has it. Keep
the plaintext on your own machine only.

## Updating a family data repo

To add a new person, fix a typo, or change a photo:

1. Edit your local plaintext JSON.
2. Re-encrypt with `encrypt.html` using the same password.
3. Commit the new `.enc.json` (overwriting the old one).

The salt and IV inside the envelope are regenerated on every encrypt, so
two encrypts of the same plaintext produce different ciphertexts. That's
expected and fine.

## Local development

The app uses `fetch()` to load the data over HTTPS, which means opening
`index.html` directly with `file://` will not work (the browser blocks
`fetch()` against `file://` origins).

### Option A: real GitHub Pages data repo

Set up a data repo following the steps above, then visit:
```
http://localhost:8000/?data=<owner>/<repo>/<family>
```
…served from the app repo's directory via any static server, e.g.:
```sh
python3 -m http.server 8000
```

### Option B: local data folder

Use the full-URL form of `?data=`. Drop a test data folder somewhere your
local server can reach and point at it:
```
http://localhost:8000/?data=http://localhost:8000/test-data/family1
```
The folder must contain `family1.enc.json` (and a `family1/` photos folder
if your plaintext references photos there).

## Files

- `index.html` — entry point
- `app.js` — all app logic (data loading, decrypt, screens)
- `styles.css` — styles
- `encrypt.html` — standalone offline encryption tool
- `robots.txt` — keep crawlers out of the app domain
