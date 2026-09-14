# RISE — AI Interview Coach

A platform where vocational-school students practise a real job interview in
their own trade and language, as many times as they need, and get useful
feedback straight away.

Built for the Erasmus+ project **KA210-VET-778D8F70** by Tehnička škola
Zrenjanin, Lycée Professionnel Jacques Le Caron and AEVA, and released so that
any school can run it.

- **Four languages** — Serbian, English, French, Portuguese. Not a translated
  interface over English content: each school authors its own interviews, in its
  own language, for its own trades.
- **A language model scores each answer** against a rubric the school wrote, and
  says why. It runs in Paris.
- **Nothing here grades anybody.** No score, answer or comment contributes to a
  mark, a progression decision or a report to parents. That is a design
  constraint, not a policy — the endpoints that would allow it do not exist.

---

## What you need

- A machine with **Node 20 or newer** and **PostgreSQL 14 or newer**
- An **API key for a language model** — Scaleway's Generative APIs by default,
  hosted in the EU
- A way to **send email** — any SMTP server, or a Resend key
- Optionally, a **Google service account** if you want to author interviews in
  Google Sheets rather than importing CSV

## Running it locally

```bash
cp backend/.env.example backend/.env     # then fill in the blanks
(cd backend  && npm install)
(cd frontend && npm install)

(cd backend && ./scripts/create-database.sh rise)
```

That last command prints a `DATABASE_URL`. Put it in `backend/.env`, then:

```bash
(cd backend  && npm run dev)     # http://localhost:3002
(cd frontend && npm run dev)     # http://localhost:5173
```

Create the first administrator:

```bash
(cd backend && node scripts/create-super-admin.mjs)
```

## Putting it on a server

**The whole path, step by step, is at <https://riseproject.space/setup>** —
including the parts that are not commands: the DNS record, the keys you have to
go and get, the first administrator, and what to do before students arrive.

The short version. One script takes a bare Debian or Ubuntu machine to a working
install — packages, a deploy user, PostgreSQL, systemd, nginx with TLS, log
rotation and a daily backup:

```bash
scp deploy/provision-production.sh root@your-server:/root/
ssh root@your-server 'RISE_DOMAIN=rise.your-school.example bash /root/provision-production.sh'
```

`RISE_DOMAIN` is not optional: the built-in default is *our* hostname, and left
alone the script will ask a certificate authority for a name you do not own.

It is re-runnable, it will not overwrite what is already there, and it ends by
printing exactly what still needs a human: the keys it cannot invent, the first
administrator, and a backup destination.

Deploys after that are one command, run deliberately:

```bash
ssh deploy@your-server 'bash /opt/apps/rise/current/deploy/deploy-production.sh'
```

## The database

`backend/schema.sql` is the whole database in one file, and
`create-database.sh` applies it. `backend/migrations/` is empty on purpose —
see [its README](backend/migrations/README.md) for why, and for the two rules
that matter when you add one.

## Content

Each school points the platform at **its own** spreadsheet and imports it when
ready. Editing the sheet changes nothing until somebody presses import, which
is what stops a half-finished edit reaching a class mid-lesson. Imports are
versioned: every interview records the version it was taken against, so
changing a question can never alter an interview already sat.

Sample content to start from is in [`seed/sheets/`](seed/sheets/).

## Data protection

The people using this are mostly minors, and a good deal of the design exists
because of that rather than despite it.

- **A school completes its own privacy notice** — controller, data protection
  officer, lawful basis, retention periods — and the notice assembles its
  sentences in all four languages. Until a school fills them in, the gaps are
  visible.
- **Every staff read of a student's record is logged**, and the log survives the
  deletion of the account it describes.
- **No administrator, at any level, can read a transcript.** Only the student
  and teachers at their own school can. This is enforced by the absence of any
  endpoint that would produce one.
- **A person downloads their own data themselves**, immediately, without asking
  anybody.
- **Dictated audio is never stored.** It is held in memory for one call to the
  transcription service and dropped.

If you run this for real students, read
[the architecture document](docs/architecture/index.html) first — the
sections on tenancy, audit and retention are the ones that will matter to your
data protection officer.

## Documents

Published at **<https://riseproject.space>** — the same files, served from
`docs/` by GitHub Pages.

- [Platform Requirements](docs/prd/index.html) — what it does and
  why, including what was deliberately left out
- [Architecture & Infrastructure](docs/architecture/index.html) — how it is
  built, how it is deployed, and where the bodies are buried
- [Visual Design](docs/design/index.html) — the design system, which
  renders itself
- [Setup guide](docs/setup/index.html) — a bare machine to a school's first
  interview

## Tests

```bash
(cd backend && npm test)
```

They run without a database and without network access. That is deliberate:
the rules worth testing — who may see whose records, how many interviews a
student may start, which privacy-notice changes require re-reading — are
written as functions that touch nothing, precisely so they can be tested
without standing anything up.

## Licence

**European Union Public Licence v. 1.2** — see [LICENSE](LICENSE).

Copyright © 2026 Tehnička škola Zrenjanin, on behalf of the Erasmus+ project
KA210-VET-778D8F70.

The EUPL is the European Commission's own open-source licence. It was chosen
over MIT or Apache-2.0 because this platform is publicly funded and holds data
about minors: the EUPL is **reciprocal**, so a school or company that improves
it and distributes the result must pass those improvements on under the same
terms. Work paid for once with public money does not quietly become somebody's
closed product.

Three things worth knowing if you build on it:

- It is **compatible** with the GPL, AGPL, LGPL, MPL-2.0, EPL-1.0, OSL, CeCILL
  and others — the full list is the Appendix at the end of the licence. You can
  combine this with code under any of them.
- The licence exists in **all 23 official EU languages**, and every version is
  equally valid. The English text is here; the others are at
  <https://joinup.ec.europa.eu/collection/eupl>.
- It is drafted against **EU law** and names a jurisdiction, which the
  American licences do not. For a consortium of schools in Serbia, France and
  Portugal answering to their own data protection authorities, that is the point
  rather than a detail.
