# Setup

Reach this file when `add`, evidence, transit, or ruling-planets needs packages, on a host that can write the working directory and run skill scripts. Otherwise stay in `SKILL.md`: take person evidence from the user and read `<skill-dir>/references/`.

`<skill-dir>` is the installed skill directory (the folder that contains this `instructions/` tree).

## Packages

From the working directory:

```bash
bash "<skill-dir>/scripts/setup.sh"
```

Done when stdout reports `status: installed` for that directory. Treat package-manager warnings as noise. The script writes packages into `node_modules` without changing an existing package manifest, lockfile, or person records.

## Guidebooks

```bash
rm -rf ./references
cp -R "<skill-dir>/references" ./references
```

Done when `./references/kp/` and `./references/parashari/` exist. The `rm` makes a re-run replace the previous copy rather than nest `references/references`.

## Person record

Collect name, an ISO 8601 moment with `Z` or an explicit UTC offset, latitude, and longitude. Resolve place name and historical offset first. Sex is optional.

Invoke `ascendant_add_person` when the host exposes it. Otherwise:

```bash
bash "<skill-dir>/scripts/add-person.sh" \
  --name "Person Name" \
  --moment "2000-01-01T12:00:00+05:30" \
  --latitude 12.9716 \
  --longitude 77.5946 \
  --sex Female
```

Done when stdout reports `created` or `refreshed` for `persons/<name>/` and that directory contains `input.md`, `MEMORY.md`, `charts/`, `dasha.md`, `pratyantardasha.md`, `sookshma.md`, `kp/`, `sav.md`, and `jaimini/`. Identical birth data refreshes; different birth data needs another name.
