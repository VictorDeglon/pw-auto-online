# The game server as a container: the official Nakama image plus this module.
# Runs as an unprivileged user; the module is read-only; secrets come from the environment at start (docker-entrypoint.sh),
# never from the image. See docker-compose.yml for Postgres, the network layout and the hardening flags.
FROM heroiclabs/nakama:3.41.0

RUN useradd --system --uid 10001 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin nakama
COPY roads.js traffic.js index.js /tmp/module/
RUN cat /tmp/module/roads.js /tmp/module/traffic.js /tmp/module/index.js > /nakama/data/modules/index.js && chmod 644 /nakama/data/modules/index.js && rm -rf /tmp/module # Nakama loads one file
COPY --chown=root:root --chmod=755 docker-entrypoint.sh /usr/local/bin/pw-nakama

USER nakama
EXPOSE 7350 7351
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 CMD ["/nakama/nakama", "healthcheck"]
ENTRYPOINT ["tini", "--", "/usr/local/bin/pw-nakama"]
