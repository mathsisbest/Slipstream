# Slipstream's own gate.

SHELL_SCRIPTS := bin/doctor.sh bin/slipstream hooks/guard-bash.sh hooks/guard-write.sh hooks/format-on-save.sh hooks/notify-stop.sh hooks/tests/guards.test.sh tests/cli.test.sh

.PHONY: ci lint test

ci: lint test
	@echo "make ci: PASS"

lint:
	for sh in $(SHELL_SCRIPTS); do bash -n "$$sh"; done
	node --check lib/slipstream-cli.mjs
	node --check workflows/project-builder.js
	node -e "JSON.parse(require('fs').readFileSync('hooks/settings.fragment.json', 'utf8'))"

test:
	bash hooks/tests/guards.test.sh
	bash tests/cli.test.sh
