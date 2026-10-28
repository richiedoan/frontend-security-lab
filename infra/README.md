# Local identity infrastructure

Optional Keycloak and Postgres infrastructure for this educational lab. This is
development-only: Keycloak runs `start-dev` over HTTP, with dummy credentials.
It is not a production deployment. The [Day 5 realm](keycloak/README.md) defines
the public `security-web` client in Keycloak. The web app's
[Day 5 browser login](../docs/labs/keycloak-oidc.md) uses this client.

Install and start Docker Desktop with Docker Compose v2 or newer. The pinned
images (`quay.io/keycloak/keycloak:26.7.2` and `postgres:17.6-bookworm`) support
Linux ARM64 for Apple Silicon and AMD64. Compose selects the native architecture;
no emulation or `platform: linux/amd64` override is needed.

Run all commands below from `infra/`.

## Start and inspect

```sh
cd infra # from the repository root; only once
cp .env.example .env # first setup only; do not overwrite an existing .env
docker compose config --quiet
docker compose up -d --wait --wait-timeout 180
docker compose ps
docker compose logs -f --tail=100 keycloak postgres
```

Open <http://localhost:8080/admin/> and sign in with the bootstrap admin values
from `.env`. The example values are disposable dummy credentials, not real
credentials. `.env` is ignored by the repository's root `.gitignore`.

Keycloak is published only on `127.0.0.1:8080`. Postgres and Keycloak's management
port 9000 are not published to the host. Postgres uses `pg_isready`; Keycloak
checks `/health/ready` internally using Bash. Metrics are enabled so readiness
includes the database connection check. Initial startup can take a little longer
while Keycloak builds its development configuration.

## Stop and reset

Stop and remove containers, keeping database contents:

```sh
docker compose down
```

Start again with `docker compose up -d --wait --wait-timeout 180`. Realms, users,
and settings live in the named volume `frontend-security-lab-infra_postgres_data`.
Database initialization and bootstrap admin values apply to a fresh database;
editing `.env` does not rotate credentials already stored there.

Reset deletes **all local database contents**, including realms and users:

```sh
docker compose down --volumes
docker compose up -d --wait --wait-timeout 180
```

Reset leaves `.env` and any files in `realm-data/` intact.

## Realm export and import

Use only disposable lab realms and users. Startup imports the checked-in `lab`
realm if it does not already exist; see the [Day 5 instructions](keycloak/README.md)
for one-time user password setup and explicitly reapplying the seed. The local `realm-data/` directory is ignored
because CLI exports can contain secrets and user data.

Stop Keycloak before either operation and keep Postgres running. Export a realm
and its users to `realm-data/lab-realm.json`:

```sh
mkdir -p realm-data
docker compose stop keycloak
docker compose up -d --wait postgres
docker compose run --rm --no-deps -v "$(pwd)/realm-data:/opt/keycloak/data/transfer" keycloak export --dir /opt/keycloak/data/transfer --realm lab --users realm_file
docker compose up -d --wait --wait-timeout 180 keycloak
```

Import JSON files from that directory (including files copied from another local
lab). Keep the `<realm-name>-realm.json` naming convention. Existing realms are
skipped with `--override=false`:

```sh
mkdir -p realm-data
docker compose stop keycloak
docker compose up -d --wait postgres
docker compose run --rm --no-deps -v "$(pwd)/realm-data:/opt/keycloak/data/transfer:ro" keycloak import --dir /opt/keycloak/data/transfer --override=false
docker compose up -d --wait --wait-timeout 180 keycloak
```

To deliberately replace existing local realms, use `--override=true` in the
import command while Keycloak is stopped. Check the one-off command's exit status
and output before restarting. Realm exports do not include all database state
(for example, persisted sessions); they are not full database backups.

References: Keycloak's [container guide](https://www.keycloak.org/server/containers),
[health checks](https://www.keycloak.org/observability/health), and
[realm import/export guide](https://www.keycloak.org/server/importExport).
