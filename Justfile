# Default recipe: list available recipes
default:
  just --list

# Start the full local stack in Docker Compose (critique §4.2)
dev:
  docker compose up --build

# Stop the local stack and remove containers
dev-down:
  docker compose down

# Run all verification checks: types, linter, architecture rules, and tests (plan §1)
check:
  pnpm typecheck
  pnpm lint
  pnpm dep-check
  pnpm test

# Run Vitest test suite across all packages and apps
test:
  pnpm test

# Run the 60-case Socratic and instructor evaluation suite (plan Phase 3)
eval:
  pnpm eval

# Run TypeScript compiler checks in strict mode
typecheck:
  pnpm typecheck

# Run ESLint across the codebase
lint:
  pnpm lint

# Run architecture boundary checks (dependency-cruiser)
dep-check:
  pnpm dep-check

# Run database migrations
db-migrate:
  pnpm db:migrate

# Seed the database with SDI college and sandbox course
db-seed:
  pnpm db:seed

# Reset demo state: clear conversations and restore default full course setting (plan Phase 5)
demo-reset:
  pnpm demo:reset

