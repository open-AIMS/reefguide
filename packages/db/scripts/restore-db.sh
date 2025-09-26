#!/bin/bash

# Load environment variables
source .env

# Check if filename was provided as argument
if [ "$1" ]; then
    BACKUP_FILE="$1"
else
    # Show available backup files
    echo "Available backup files:"
    find . -name "*.sql" -o -name "*.dump" | head -10
    echo ""
    read -p "Enter backup filename: " BACKUP_FILE
fi

# Check if file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: File '$BACKUP_FILE' not found"
    exit 1
fi

# Determine restore method based on file extension
if [[ "$BACKUP_FILE" == *.sql ]]; then
    echo "Restoring from SQL file: $BACKUP_FILE"
    psql "$DATABASE_URL" < "$BACKUP_FILE"
else
    echo "Restoring from dump file: $BACKUP_FILE"
    pg_restore -d "$DATABASE_URL" "$BACKUP_FILE"
fi

echo "Restore completed!"
