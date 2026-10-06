.PHONY: up down logs migrate migration test lint

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

migrate:
	docker compose exec backend alembic upgrade head

# usage: make migration m="add foo"
migration:
	docker compose exec backend alembic revision --autogenerate -m "$(m)"

test:
	docker compose exec backend pytest -q
	docker compose exec frontend npm test --silent

lint:
	docker compose exec backend ruff check .
	docker compose exec frontend npm run typecheck
