#!/bin/bash
set -e

pkill -f 'sqd run' || true && pkill -f 'sqd process' || true && pkill -f 'sqd serve' || true
echo "🔌 Checking for processes using port 4350..."
lsof -ti:4350 | xargs kill -9 2>/dev/null || true

sqd down && sqd up

echo "⏳ Waiting for database to be ready..."
until docker exec quantus-subsquid-public-db-1 pg_isready -q; do
    echo "Database not ready yet, waiting 2 seconds..."
    sleep 2
done
echo "✅ Database is ready!"

echo "🔨 Building project..."
sqd typegen
sqd codegen
sqd migration:generate
node scripts/patch-migration-gin-indexes.js

echo "📋 Applying migrations..."
sqd migration:apply

echo "✅ Verifying database tables..."
docker exec quantus-subsquid-public-db-1 psql -U user -d squid -c "\dt"

echo "🎉 Database reset complete!"
