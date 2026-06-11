# User guide: from zero to running

This walks you through setting the project up on a fresh machine, getting access to the database, pulling the code, configuring the environment, and running the app. Then it shows you the basics of using it. Follow it top to bottom the first time.

If you only want to *use* an instance someone already set up for you, skip to [Using the platform](#using-the-platform).

---

## Part 1 — Setup

### What you need first

- An editor in the VS Code family. The project is built for [Antigravity](https://antigravity.google) but plain VS Code works too.
- [Docker](https://www.docker.com/products/docker-desktop/) running on your machine. The project runs inside a Dev Container, so you do not install Node, the database tools, or anything else by hand.
- A GitHub account with access to the `bloomsbury-network-mapper` repository.
- Access to the project's Supabase (the database). Ask the project owner to invite you, or get the connection keys from them. See [Part 2](#part-2--supabase-access).

### Step 1: Get the code

You have two options.

**Option A — clone first, then open in the container (recommended):**

```bash
git clone https://github.com/Ithelastghostl/bloomsbury-network-mapper.git
cd bloomsbury-network-mapper
```

Then open that folder in your editor.

**Option B — open the repo URL directly** if your editor supports "Clone in Container Volume". Either is fine.

### Step 2: Reopen in the container

When the editor detects the `.devcontainer/` folder it will prompt you to **Reopen in Container**. Accept.

The first build takes several minutes. The post-create script installs Node 24, the Supabase CLI, the Vercel CLI, and the command-line AI tools, and starts `gh auth login` so you can connect your GitHub account. Let it finish.

When it is done you have a fully provisioned environment. You did not have to install any of it on your own machine.

### Step 3: Connect your accounts

Inside the container terminal:

```bash
supabase login     # opens a browser link to authorise the Supabase CLI
vercel login       # only needed if you will deploy; skip otherwise
```

`gh auth login` was started for you during the build. If it did not complete, run it again.

---

## Part 2 — Supabase access

Supabase is the Postgres database that holds everything: the people, their connections, the evidence, the scores. The app reads and writes it. You need three values from it.

### Getting the keys

Ask the project owner for access to the Supabase project, or for the keys directly. In the [Supabase dashboard](https://supabase.com/dashboard) for the project:

1. Go to **Project Settings → API**.
2. Copy the **Project URL**.
3. Copy the **anon public** key.
4. Copy the **service_role** key. This one is secret and has full read/write access. Never commit it, never paste it anywhere public, never put it in client-side code.

### Linking the CLI (only if you will run scripts or migrations)

If you are just using the app you can skip this. If you will run database migrations or the maintenance scripts, link the CLI to the project:

```bash
supabase link --project-ref <the-project-ref>
```

The project ref is the short ID in the project's dashboard URL. The current build is linked to a project ref the owner can give you.

---

## Part 3 — Environment configuration

The app reads its secrets from a file called `web/.env.local`. It is not committed (it is in `.gitignore`), so you create it once.

### Step 1: Copy the example

```bash
cd web
cp .env.local.example .env.local
```

### Step 2: Fill in the values

Open `web/.env.local` and set the three required values from Part 2:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

What each one is for:

| Variable | What it is | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The database's address | The `NEXT_PUBLIC_` prefix means it is sent to the browser. That is expected. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The public, restricted key | Safe for the browser. Row-level security limits what it can read. |
| `SUPABASE_SERVICE_ROLE_KEY` | The secret, full-access key | Server-side only. Bypasses row-level security. Keep it secret. |

### Step 3 (optional): Local mode for development

There is one more variable you may want while developing locally:

```
CRM_LOCAL_MODE=true
```

This lets the analyst action buttons (such as "Augment & Persist") work without a logged-in admin session, which is convenient on your own machine. It is ignored automatically when `NODE_ENV=production`, so it cannot weaken the deployed app. Leave it out unless you are doing local development and hit a permissions wall.

---

## Part 4 — Running the app

From the `web/` folder:

### Development mode (use this while working)

```bash
npm install      # first time only, to install dependencies
npm run dev
```

Open `http://localhost:3000`. The home page is the entry point; the platform itself lives under `/crm`.

Development mode reloads automatically when you change code.

> **Running inside a container?** Bind to all interfaces so your host browser can reach it: `npx next dev -H 0.0.0.0 -p 3000`, and make sure the container publishes port 3000 (the dev container does this for you). If the page will not load in your browser but `curl http://localhost:3000` works inside the container, the problem is port forwarding, not the app.

### Production mode (what is deployed)

```bash
npm run build    # compile an optimised build
npm run start    # serve it
```

### The other commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run with hot reload, for development. |
| `npm run build` | Compile a production build. |
| `npm run start` | Serve the production build. |
| `npm run lint` | Check code style. Run before committing. |
| `npm run typecheck` | Check types. Run before committing. |
| `npm test` | Run the test suite. |

---

## Using the platform

Once the app is up, here is how to find your way around and do the core loop. For the deeper workflow, read `03_ANALYST_PLAYBOOK.md`.

### The shape of the screen

The left sidebar is the whole app, grouped into five sections in order: **Observe**, **Orient**, **Decide**, **Act**, and **Tools**. This follows the OODA loop (see `00_WHAT_THIS_IS.md`). Work generally flows top to bottom and left to right: look at the data, understand the relationships, decide who to pursue, act on it.

### The fastest path to value

If you do nothing else, do this:

1. **Open Decide → Lead Generator.** This is the ranked list of people worth approaching. The top of the list is where to look.

2. **Read a row.** Each lead shows its priority score, confidence score, category, and a strip of signal chips (what we know about them). Higher priority means more worth pursuing; higher confidence means we trust the data more.

3. **Click the row to expand it.** You get the "why this lead" card (the strongest reasons), the introduction paths (which supporter can reach them and how), and the score breakdown. This is the case for approaching them.

4. **Open the full dossier.** Click through to the person's page for the complete intelligence profile: every score with its explanation, all the evidence with sources, the connection list, suggested action, and space for your notes and tags.

5. **Make a judgement.** Confirm the identity if you are satisfied it is the right person. If a connection is wrong, remove it. If the lead is good, send it to the action backlog. Leave a note for whoever picks it up next.

### Filtering to what matters

In the Lead Generator you can:

- **Filter by category** (HNW target, wealth identified, charity donor, discovered).
- **Filter by signal** (only people with directorships, only philanthropy signals, and so on).
- **Toggle "multi-source"** to show only leads corroborated by more than one source, which are the most trustworthy.
- **Rank by a specific method** using the Decide sub-tabs (By Influence, By Capacity, By Introability, By Affinity), or the main Lead Generator for the balanced overall priority.

### A note on what you will and will not see

You will not see your own supporters in the leads list. That is deliberate: you already have direct access to them, so they are not "leads". Their value is the introductions they can make, which is why they appear as introducers on other people's paths. If you are looking for a supporter, they are under Observe → Supporters.

### When you are stuck

- A term you do not recognise: `04_GLOSSARY.md`.
- "Where does this number come from?": `02_SCORING_AND_TABS.md`.
- "Can I trust this figure?": `05_DATA_AND_PROVENANCE.md`.
