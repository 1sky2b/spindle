# Push Spindle to your GitHub repo

Run these in the unzipped `spindle` folder (Command Prompt or PowerShell).
Replace nothing except, if prompted, your GitHub credentials.

    git init
    git add .
    git commit -m "Spindle: personal work harness (initial commit)"
    git branch -M main
    git remote add origin https://github.com/1sky2b/spindle.git
    git push -u origin main

If the push asks for a password, GitHub wants a **personal access token**,
not your account password: github.com -> Settings -> Developer settings ->
Personal access tokens -> Fine-grained tokens -> generate one with
Contents: Read and write for this repo, and paste it as the password.

## Then, at work

    git clone https://github.com/1sky2b/spindle.git
    cd spindle
    node server.js

## Keeping it in sync

    git add . && git commit -m "what changed" && git push

Note: `runs/` is gitignored (local audit trail). Thread content IS tracked by
default so your charters and memory travel between machines - if you'd rather
keep thread data off GitHub, uncomment the thread lines in `.gitignore`.
