.PHONY: setup backend frontend test lint openapi api-client up down

export UV_CACHE_DIR := $(CURDIR)/.uv-cache
export npm_config_cache := $(CURDIR)/.npm-cache

setup:
	test -f .env || cp .env.example .env
	cd backend && uv sync
	cd frontend && npm install

backend:
	docker compose up --build mongodb backend

frontend:
	cd frontend && npm run dev

test:
	cd backend && uv run pytest
	cd frontend && npm run build

lint:
	cd backend && uv run ruff check .
	cd frontend && npm run lint

openapi:
	cd backend && uv run python -c 'import json; from app.main import app; print(json.dumps(app.openapi()))' > ../openapi.json

api-client: openapi
	cd frontend && npm run generate:api

up:
	docker compose up --build -d

down:
	docker compose down
