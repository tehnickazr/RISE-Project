#!/usr/bin/env bash
#
# Provision a RISE production host from nothing.
#
#   scp deploy/provision-production.sh root@<ip>:/root/
#   ssh root@<ip> 'bash /root/provision-production.sh'
#
# Brings a bare Debian/Ubuntu VPS to the point where `deploy-production.sh`
# works: packages, a deploy user, PostgreSQL, the app under systemd, nginx with
# TLS, log rotation, and a daily database backup — local from the first run,
# encrypted and off-site as soon as there is a bucket to put it in.
#
# ---------------------------------------------------------------------------
# What this script will NOT do, deliberately
# ---------------------------------------------------------------------------
#
#   * It does not invent secrets you have to obtain — the Scaleway inference
#     key, the Google service account, the mailbox password. It writes a .env
#     with everything else filled in and every missing value marked, then tells
#     you which ones to add. A script that generated placeholders which *looked*
#     like keys would produce a server that starts and then fails at the first
#     interview, which is a worse failure than not starting.
#   * It does not create the first administrator account. That is one command,
#     printed at the end, and it should be run by a person who knows which
#     address is going to own the platform.
#   * It does not enable the deploy timer. On staging a minute-poll auto-deploy
#     is convenient; on a host carrying interview transcripts, "what is running"
#     should change because somebody decided it should.
#
# Re-runnable. Every step checks before it acts and says what it skipped.

set -euo pipefail

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

DOMAIN="${RISE_DOMAIN:-app.riseproject.space}"
ADMIN_EMAIL="${RISE_ADMIN_EMAIL:-admin@riseproject.space}"
APP_USER="deploy"
APP_ROOT="/opt/apps/rise"
APP_DIR="$APP_ROOT/current"
SHARED_DIR="$APP_ROOT/shared"
ENV_FILE="$SHARED_DIR/.env"
LOG_DIR="/var/log/rise"
DB_NAME="rise"
DB_ROLE="rise"
APP_PORT="3002"
REPO="${RISE_REPO:-https://github.com/tehnickazr/RISE-Project.git}"
BRANCH="${RISE_BRANCH:-main}"
# Active LTS. Node 24 "Krypton" since October 2025; 26 is Current and does not
# become LTS until October 2026. Verified against nodejs.org/dist/index.json
# rather than remembered.
NODE_MAJOR="24"

# Hostinger's outgoing mail. 465 is implicit TLS, which the mailer detects from
# the port — see backend/src/email/mailer.js. Verify both in hPanel → Emails;
# Hostinger has changed these before.
SMTP_HOST_DEFAULT="smtp.hostinger.com"
SMTP_PORT_DEFAULT="465"

step()  { printf '\n\033[1;34m==>\033[0m \033[1m%s\033[0m\n' "$*"; }
info()  { printf '    %s\n' "$*"; }
skip()  { printf '    \033[2m— %s\033[0m\n' "$*"; }
warn()  { printf '    \033[1;33m!\033[0m %s\n' "$*"; }
die()   { printf '\n\033[1;31mFAILED:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root: ssh root@host 'bash $0'"
command -v apt-get >/dev/null || die "This script expects Debian or Ubuntu."

# ---------------------------------------------------------------------------
# 0 — Preflight
# ---------------------------------------------------------------------------

step "Preflight"

MY_IP="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
info "This host : ${MY_IP:-unknown}"
info "$DOMAIN → ${DNS_IP:-does not resolve}"

TLS_OK=1
if [[ -z "$DNS_IP" || "$DNS_IP" != "$MY_IP" ]]; then
  TLS_OK=0
  warn "DNS does not point here yet. Everything else will still be set up;"
  warn "TLS will be skipped and you can run this script again once the A record"
  warn "for $DOMAIN points at ${MY_IP:-this host}. Certbot cannot issue a"
  warn "certificate for a name that does not resolve to the machine asking."
fi

# ---------------------------------------------------------------------------
# 1 — Packages
# ---------------------------------------------------------------------------

step "Packages"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

if ! command -v node >/dev/null || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt "$NODE_MAJOR" ]]; then
  info "Installing Node $NODE_MAJOR from NodeSource"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs
else
  skip "Node $(node -v) already present"
fi

apt-get install -y -qq \
  postgresql postgresql-contrib \
  nginx certbot python3-certbot-nginx \
  git curl ca-certificates ufw \
  unattended-upgrades logrotate restic jq
info "postgres $(psql --version | awk '{print $3}') · nginx $(nginx -v 2>&1 | sed 's#.*/##') · node $(node -v)"

# Security updates apply themselves. A host that needs a person to remember is a
# host that stays unpatched.
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# 2 — The deploy user and the directory layout
# ---------------------------------------------------------------------------

step "User and layout"

if id "$APP_USER" >/dev/null 2>&1; then
  skip "user $APP_USER exists"
else
  adduser --system --group --shell /bin/bash --home "/home/$APP_USER" "$APP_USER"
  info "created $APP_USER"
fi

# The deploy user restarts its own service and nothing else. Full sudo would
# make a compromise of the deploy key a compromise of the machine.
cat > /etc/sudoers.d/rise-deploy <<EOF
$APP_USER ALL=(root) NOPASSWD: /bin/systemctl restart rise, /bin/systemctl status rise, /bin/systemctl --no-pager --full status rise
EOF
chmod 0440 /etc/sudoers.d/rise-deploy
visudo -c -f /etc/sudoers.d/rise-deploy >/dev/null || die "sudoers fragment is invalid"

install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$APP_ROOT"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$SHARED_DIR"
install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$LOG_DIR"

# The operator's key, copied to the deploy user so deploys do not need root.
if [[ -f /root/.ssh/authorized_keys ]]; then
  install -d -o "$APP_USER" -g "$APP_USER" -m 0700 "/home/$APP_USER/.ssh"
  install -o "$APP_USER" -g "$APP_USER" -m 0600 \
    /root/.ssh/authorized_keys "/home/$APP_USER/.ssh/authorized_keys"
  info "copied root's authorized_keys to $APP_USER"
else
  warn "/root/.ssh/authorized_keys not found — add your key for $APP_USER by hand"
fi

# ---------------------------------------------------------------------------
# 3 — SSH and firewall
# ---------------------------------------------------------------------------

step "SSH and firewall"

# Safe because a key is already installed: this script is running over one.
if grep -qE '^\s*PasswordAuthentication\s+no' /etc/ssh/sshd_config; then
  skip "password authentication already off"
else
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  grep -qE '^PasswordAuthentication no' /etc/ssh/sshd_config || echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config
  sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  sshd -t || die "sshd config is invalid — NOT restarting, your session is safe"
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
  info "password authentication disabled, key-only from now on"
fi

ufw allow OpenSSH >/dev/null
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
info "firewall: 22, 80, 443 — PostgreSQL is not exposed and must not be"

# ---------------------------------------------------------------------------
# 4 — The application checkout
# ---------------------------------------------------------------------------

step "Application checkout"

if [[ -d "$APP_DIR/.git" ]]; then
  skip "checkout exists at $APP_DIR"
else
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
  info "cloned $BRANCH"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ---------------------------------------------------------------------------
# 5 — PostgreSQL
# ---------------------------------------------------------------------------

step "Database"

systemctl enable --now postgresql >/dev/null

DB_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" || true)"
DB_PASS=""
if [[ "$DB_EXISTS" == "1" ]]; then
  skip "database '$DB_NAME' exists — leaving it and its role alone"
else
  DB_PASS="$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))")"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -c "CREATE ROLE \"$DB_ROLE\" LOGIN PASSWORD '$DB_PASS';"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_ROLE\";"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -c "REVOKE ALL ON DATABASE \"$DB_NAME\" FROM PUBLIC;"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -c "GRANT ALL ON DATABASE \"$DB_NAME\" TO \"$DB_ROLE\";"
  info "created role and database '$DB_NAME'"
fi

# Who connected and when. The application log cannot see a psql session, so
# without this a maintenance connection leaves no trace at all.
PG_CONF="$(sudo -u postgres psql -tAc 'SHOW config_file')"
if grep -qE "^log_connections\s*=\s*on" "$PG_CONF"; then
  skip "connection logging already on"
else
  printf '\n# RISE: evidence of direct database access\nlog_connections = on\nlog_disconnections = on\n' >> "$PG_CONF"
  systemctl restart postgresql
  info "enabled connection logging"
fi

# ---------------------------------------------------------------------------
# 6 — Environment file
# ---------------------------------------------------------------------------

step "Environment"

if [[ -f "$ENV_FILE" ]]; then
  skip ".env exists — not overwriting it"
else
  SESSION_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))")"
  DB_URL="postgresql://$DB_ROLE:${DB_PASS:-<set-this>}@localhost:5432/$DB_NAME"

  cat > "$ENV_FILE" <<EOF
# RISE production. Generated by provision-production.sh on $(date -Iseconds).
#
# Lines marked NEEDS VALUE must be filled in before the platform works. The
# service will start without them; the failures arrive later, at the first
# interview or the first invitation, which is why they are marked rather than
# guessed.

NODE_ENV=production
PORT=$APP_PORT
APP_ORIGIN=https://$DOMAIN

DATABASE_URL=$DB_URL
SESSION_SECRET=$SESSION_SECRET

# ---- Language model: Scaleway, Paris ----
# NEEDS VALUE — Scaleway console → Generative APIs → API keys
SCW_SECRET_KEY=
SCW_MODEL=qwen3.6-35b-a3b

# ---- Mail ----
# The mailbox is on the apex (riseproject.space) while the app is on a
# subdomain. That is deliberate and correct: SPF, DKIM and DMARC are published
# on the apex, and moving the from-address to match the app's hostname would
# silently unsign every message the platform sends.
#
# Both transports may be configured;
# MAIL_TRANSPORT decides which is used, because inferring it from whichever
# variables happen to be set is how a host sends through the one nobody meant.
MAIL_TRANSPORT=smtp
EMAIL_FROM="RISE <$ADMIN_EMAIL>"
SMTP_HOST=$SMTP_HOST_DEFAULT
SMTP_PORT=$SMTP_PORT_DEFAULT
SMTP_USER=$ADMIN_EMAIL
# NEEDS VALUE — the mailbox password from hPanel → Emails
SMTP_PASS=

# Kept so the transport can be switched back in one line if Hostinger's
# outgoing mail is refused or rate-limited during onboarding.
RESEND_API_KEY=

INVITE_EXPIRY_HOURS=72

# ---- Content: Google Sheets service account ----
# NEEDS VALUE — share each school's sheet with the service account as Viewer.
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SPREADSHEET_ID=
EOF

  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
  info "wrote $ENV_FILE (0600, owned by $APP_USER)"
  [[ -n "$DB_PASS" ]] && info "database password generated and written — it is stored nowhere else"
fi

# ---------------------------------------------------------------------------
# 7 — systemd
# ---------------------------------------------------------------------------

step "Service"

install -m 0644 "$APP_DIR/deploy/systemd/rise.service" /etc/systemd/system/rise.service
systemctl daemon-reload
systemctl enable rise >/dev/null
info "rise.service installed and enabled (not started until the build below)"

# Deliberately not enabling rise-sync.timer. See the header.
skip "rise-sync.timer left disabled — production deploys are a decision, not a poll"

# ---------------------------------------------------------------------------
# 8 — First build
# ---------------------------------------------------------------------------

step "Build and migrate"

sudo -u "$APP_USER" bash -c "cd '$APP_DIR/backend' && npm install --omit=dev --silent"

set -a; # shellcheck disable=SC1090
source "$ENV_FILE"; set +a

# Nothing below is fatal. This script is meant to be run again — aborting here
# would leave the host without nginx, TLS or a backup timer because one step
# that a later run will fix went wrong. Each failure is reported and the run
# continues; the summary repeats what still needs doing.
BUILD_OK=1

if [[ "$DATABASE_URL" == *"<set-this>"* ]]; then
  warn "DATABASE_URL has no password — the database existed before this run."
  warn "Set one and put it in $ENV_FILE:"
  warn "  sudo -u postgres psql -c \"ALTER ROLE $DB_ROLE PASSWORD 'new-password'\""
  BUILD_OK=0
elif sudo -u "$APP_USER" env DATABASE_URL="$DATABASE_URL" bash -c "
       set -e
       cd '$APP_DIR/backend'
       # schema.sql builds the database; migrations/ carries whatever has been
       # added since it was frozen. Both, in that order — the second is a no-op
       # until somebody adds the first migration, which is the point.
       psql -v ON_ERROR_STOP=1 -q -d \"\$DATABASE_URL\" -f schema.sql
       npm run migrate"; then
  info "schema applied ($(grep -c '^CREATE TABLE' "$APP_DIR/backend/schema.sql") tables)"
else
  warn "database build failed — the app will not serve until this is fixed"
  BUILD_OK=0
fi

if sudo -u "$APP_USER" bash -c "cd '$APP_DIR/frontend' && npm install --include=dev --silent && npm run build"; then
  info "frontend built"
else
  warn "frontend build failed — journalctl and the npm output above"
  BUILD_OK=0
fi

if [[ "$BUILD_OK" -eq 1 ]]; then
  systemctl restart rise
  sleep 2
  if systemctl is-active --quiet rise; then
    info "rise.service is running on node $(node -v)"
  else
    warn "rise.service did not start — journalctl -u rise -n 50"
  fi
else
  warn "not starting rise.service while the build is incomplete"
fi

# ---------------------------------------------------------------------------
# 9 — nginx and TLS
# ---------------------------------------------------------------------------

step "Web server"

VHOST="/etc/nginx/sites-available/$DOMAIN.conf"
if [[ -f "$VHOST" ]]; then
  skip "vhost exists"
else
  sed "s/__DOMAIN__/$DOMAIN/g" \
    "$APP_DIR/deploy/nginx/rise.conf.template" > "$VHOST"
  ln -sf "$VHOST" "/etc/nginx/sites-enabled/$DOMAIN.conf"
  rm -f /etc/nginx/sites-enabled/default
  info "wrote $VHOST"
fi
nginx -t >/dev/null 2>&1 || die "nginx config is invalid"
systemctl reload nginx

if [[ "$TLS_OK" -eq 1 ]]; then
  if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
    skip "certificate exists"
  else
    CERT_ARGS=(-d "$DOMAIN")
    # Only an apex gets a www alias. Asking for www.app.example.com would fail
    # the whole issuance on a name that does not resolve and nobody would type.
    if [[ "$(tr -cd '.' <<<"$DOMAIN" | wc -c)" -eq 1 ]]; then
      CERT_ARGS+=(-d "www.$DOMAIN")
    fi
    certbot --nginx "${CERT_ARGS[@]}" \
      --non-interactive --agree-tos -m "$ADMIN_EMAIL" --redirect
    info "certificate issued; renewal timer is installed by the package"
  fi
else
  warn "TLS skipped — point DNS at this host and re-run this script"
fi

# ---------------------------------------------------------------------------
# 10 — Log rotation
# ---------------------------------------------------------------------------

step "Log rotation"

cat > /etc/logrotate.d/rise <<EOF
$LOG_DIR/app.log {
  daily
  rotate 14
  compress
  delaycompress
  missingok
  notifempty
  copytruncate
  su $APP_USER $APP_USER
}
EOF
info "app.log rotates daily, 14 kept"

# ---------------------------------------------------------------------------
# 11 — Backups
# ---------------------------------------------------------------------------
#
# The most urgent item in the project, per INFRASTRUCTURE.md and every review
# since. Production has had none at all: dumps taken by hand before releases and
# at no other time.
#
# TWO LAYERS, and the first works today with nothing purchased:
#
#   Local, always on. A daily dump to this disk. It answers "somebody deleted
#   the wrong class on Tuesday", which is the likeliest way data is lost, and it
#   costs nothing and needs no account. It does NOT answer "the disk failed" or
#   "the account was lost" — a dead machine takes the database and every local
#   dump with it. Local-only is a stopgap, not a backup strategy.
#
#   Off-site, once there is a bucket. Encrypted client-side with restic, so the
#   storage provider never sees plaintext. Scaleway Object Storage is a separate
#   product from the Generative APIs key already in .env — having a Scaleway
#   account does not mean having a bucket. Until the keys are filled in this
#   half no-ops quietly and the local half keeps running.

step "Backups"

BACKUP_DIR="/var/backups/rise"
install -d -m 0700 -o root -g root "$BACKUP_DIR"
install -d -m 0750 -o "$APP_USER" -g "$APP_USER" /etc/rise
BACKUP_ENV="/etc/rise/backup.env"

if [[ -f "$BACKUP_ENV" ]]; then
  skip "backup credentials exist"
else
  cat > "$BACKUP_ENV" <<'BACKUPENV'
# Off-site backup. OPTIONAL — leave these blank and the daily local dump still
# runs. Fill them in when there is a bucket.
#
# Scaleway Object Storage is not the same product as the Generative APIs key in
# .env; it needs its own bucket and application key. Any S3-compatible bucket
# works.
#
# A server able to destroy its own backup history is one bad command away from
# having none — which is how the French and Portuguese glossaries were lost in
# August. The obvious defence, a key that can write but not delete, does NOT
# work: restic takes a lock in the repository on every run and removes it when
# it finishes, so a key without delete permission fails on the first backup.
#
# Get the property from the bucket instead. Turn on VERSIONING, and add a
# lifecycle rule expiring NON-CURRENT versions after 90 days. A delete then
# leaves the real object underneath a marker, recoverable for 90 days, while
# restic's own housekeeping still works.
#
# Do NOT enable object lock, and do NOT put a lifecycle rule on current
# versions: the first blocks erasure requests you are legally obliged to honour,
# the second deletes the live repository from the oldest end and reports success
# while doing it. https://riseproject.space/setup covers both.
RESTIC_REPOSITORY=s3:s3.fr-par.scw.cloud/rise-backups
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Generated on first run. WRITE THIS DOWN SOMEWHERE THAT IS NOT THIS SERVER:
# without it the off-site backups are unreadable ciphertext, including by you.
RESTIC_PASSWORD=
BACKUPENV
  chmod 0600 "$BACKUP_ENV"
  RESTIC_PW="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("base64url"))')"
  sed -i "s#^RESTIC_PASSWORD=#RESTIC_PASSWORD=$RESTIC_PW#" "$BACKUP_ENV"
  info "wrote $BACKUP_ENV with a generated repository password"
fi

# Written with an unquoted heredoc so the paths above are baked in; runtime
# variables are escaped so they survive to the script itself.
cat > /usr/local/bin/rise-backup <<BACKUPSCRIPT
#!/usr/bin/env bash
#
# Daily backup: the database, and the one file that cannot be reconstructed
# from anything else — session secret, database password, provider keys.
set -euo pipefail

STAMP="\$(date +%Y%m%d-%H%M%S)"
WORK="\$(mktemp -d)"
trap 'rm -rf "\$WORK"' EXIT

sudo -u postgres pg_dump -Fc "$DB_NAME" > "\$WORK/$DB_NAME.dump"
cp "$ENV_FILE" "\$WORK/env.backup"

# ---- layer 1: local, always ----
install -m 0600 "\$WORK/$DB_NAME.dump" "$BACKUP_DIR/$DB_NAME-\$STAMP.dump"
install -m 0600 "\$WORK/env.backup"    "$BACKUP_DIR/env-\$STAMP.backup"
find "$BACKUP_DIR" -type f -mtime +14 -delete
echo "rise-backup: local ok \$(date -Iseconds)"

# ---- layer 2: off-site, when configured ----
set -a
source "$BACKUP_ENV"
set +a
if [[ -z "\${AWS_ACCESS_KEY_ID:-}" ]]; then
  echo "rise-backup: off-site not configured — local copy only, which does not survive this disk"
  exit 0
fi
restic snapshots >/dev/null 2>&1 || restic init
restic backup --tag rise --host "$DOMAIN" "\$WORK"
echo "rise-backup: off-site ok \$(date -Iseconds)"
BACKUPSCRIPT
chmod 0755 /usr/local/bin/rise-backup

cat > /etc/systemd/system/rise-backup.service <<UNIT
[Unit]
Description=RISE database backup
After=network-online.target postgresql.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/rise-backup
StandardOutput=append:$LOG_DIR/backup.log
StandardError=append:$LOG_DIR/backup.log
UNIT

cat > /etc/systemd/system/rise-backup.timer <<'TIMER'
[Unit]
Description=Run the RISE backup daily

[Timer]
OnCalendar=*-*-* 02:30:00
RandomizedDelaySec=20m
Persistent=true

[Install]
WantedBy=timers.target
TIMER

systemctl daemon-reload
systemctl enable --now rise-backup.timer >/dev/null

# Run once now, so the host is never in a state of having no dump at all.
if /usr/local/bin/rise-backup >>"$LOG_DIR/backup.log" 2>&1; then
  info "first backup taken to $BACKUP_DIR"
else
  warn "first backup failed — see $LOG_DIR/backup.log"
fi
info "rise-backup.timer enabled — 02:30 daily"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

MISSING="$(grep -nE '^[A-Z_]+=$' "$ENV_FILE" | cut -d: -f2 | tr -d '=' | tr '\n' ' ' || true)"

cat <<EOF

============================================================================
 RISE production host is provisioned.

   URL        https://$DOMAIN $( [[ "$TLS_OK" -eq 1 ]] || echo '(TLS pending DNS)' )
   App        $APP_DIR on branch $BRANCH, port $APP_PORT
   Env        $ENV_FILE
   Database   $DB_NAME
   Backups    rise-backup.timer, 02:30 daily → $BACKUP_DIR (off-site optional)
   Logs       $LOG_DIR/app.log, $LOG_DIR/backup.log

 BEFORE ANYONE SIGNS IN — these are not optional:

 1. Fill in the blanks in $ENV_FILE
       ${MISSING:-none}
    then: systemctl restart rise

 2. A local backup already ran and repeats at 02:30 — see $BACKUP_DIR.
    That covers a bad delete. It does NOT cover a dead disk: the database and
    every local dump are on the same one. To close that, put an S3 bucket in
    $BACKUP_ENV and run it once by hand:
       /usr/local/bin/rise-backup && restic snapshots
    Then COPY RESTIC_PASSWORD OFF THIS SERVER — it is the only thing that
    makes those backups readable, and it lives on the machine they protect.

 3. Test that mail actually leaves, before it is an invitation to a student:
       cd $APP_DIR/backend && sudo -u $APP_USER node --env-file=$ENV_FILE \\
         scripts/check-mail.mjs $ADMIN_EMAIL

 4. Create the first platform administrator. The password is generated, shown
    once, and stored only as a hash — write it down before closing the terminal:
       cd $APP_DIR/backend && sudo -u $APP_USER node --env-file=$ENV_FILE \\
         scripts/create-super-admin.mjs $ADMIN_EMAIL "Platform administrator"

 5. Confirm your provider's MACHINE backups are enabled, in their panel.
    Usually on by default; check the retention while you are there. Nothing on
    this host can do that, and they answer the failure the dump cannot: the
    machine you restore onto. Note that a provider "snapshot" is a different
    thing — manual, one at a time, and often deleted within a day.

 Deploys are manual on purpose:
       ssh $APP_USER@$DOMAIN 'bash $APP_DIR/deploy/deploy-production.sh'

 The whole path, with the parts that are not commands:
       https://riseproject.space/setup
============================================================================
EOF
