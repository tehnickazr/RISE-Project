# Migrations

**This directory is empty on purpose, and the runner that reads it is not.**

A new database is built by `schema.sql`, not by replaying migrations:

```bash
./scripts/create-database.sh rise
```

That file is the complete schema, frozen. The twenty-five migrations that
produced it were this project's own history — one of them is called *"split
scores out of the JSON"*, a sentence that means nothing to anyone who never had
the JSON. Replaying them would also mean a new installation taking a path no
installation has ever needed to take.

## So why keep the runner?

Because the *second* change to the database cannot work the way the first one
did. `create-database.sh` builds a database from nothing. The first time a fix
needs a new column, it will meet a database holding real student answers, and
that file cannot be applied to it.

The alternative is editing the live database by hand in `psql`, which is how
environments drift apart and how a restore stops matching the code.

## Adding one

Create a numbered file here and deploy. The runner applies anything it has not
already recorded, in filename order, inside a transaction:

```
backend/migrations/0001_add_something.sql
```

Numbering starts at `0001` again. Nothing here refers to the operator's
history, so there is no collision to avoid.

```bash
npm run migrate      # applies anything new; safe to re-run
```

## Two rules that are worth more than they look

**Never edit a migration that has been applied anywhere.** An applied migration
is a fact about a database, not a file. Editing it changes what *future*
installations get and nothing else — the servers that already ran it keep what
they got, silently, and the two drift apart with nothing announcing it. If a
migration was wrong, add another one that corrects it.

**Never delete one either.** The runner records filenames. A file that vanishes
is not un-applied; it just stops being visible.

## Keeping `schema.sql` honest

`schema.sql` describes a *new* database. Once you add migrations here, an
upgraded database and a fresh one start to diverge — the fresh one is missing
everything under this directory.

For a small number of migrations that is fine and normal: a new install applies
`schema.sql` and then the migrations on top, which is exactly what
`create-database.sh` followed by `npm run migrate` does.

If this directory ever grows large enough that the two-step feels like history
again, regenerate `schema.sql` from a database built that way, and empty this
directory. That is precisely how the file you have was made.
