SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help install backend frontend build run clean templates docker

help:
	@echo "Sigma — common tasks"
	@echo "  make install    Install frontend dependencies (pnpm)"
	@echo "  make backend    Run Go API on :9000"
	@echo "  make frontend   Run Vite dev server on :5173"
	@echo "  make build      Build frontend and Go binary"
	@echo "  make run        Build and run production server (:9000)"
	@echo "  make templates  Regenerate embedded design templates"
	@echo "  make docker     Build the Docker image"
	@echo "  make clean      Remove build output and local database"

install:
	cd frontend && pnpm install

backend:
	cd backend && PORT=$${PORT:-9000} DB_PATH=$${DB_PATH:-data/sigma.db} go run .

frontend:
	cd frontend && pnpm dev

templates:
	cd frontend && pnpm gen:templates

build:
	cd frontend && pnpm build
	cd backend && go build -o ../sigma-server .

run: build
	DB_PATH=$${DB_PATH:-backend/data/sigma.db} \
	UPLOAD_DIR=$${UPLOAD_DIR:-backend/data/uploads} \
	PORT=$${PORT:-9000} \
	SIGMA_SECRET=$${SIGMA_SECRET:-sigma-dev-secret-change-in-production} \
	STATIC_DIR=$(CURDIR)/frontend/dist \
	./sigma-server

docker:
	docker build -t sigma .

clean:
	rm -rf sigma-server frontend/dist backend/data
