#!/bin/bash

# Known safe .env locations (relative to packages/ directory)
KNOWN_LOCATIONS=(
    "packages/app/.env"
    "packages/capacity-manager/.env"
    "packages/cli/.env"
    "packages/db/.env"
    "packages/example-worker/.env"
    "packages/infra/.env"
    "packages/types/.env"
    "packages/web-api/.env"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Find all .env files in child directories
mapfile -t env_files < <(find . -mindepth 2 -type f -name ".env")

if [ ${#env_files[@]} -eq 0 ]; then
    echo "No .env files found in child directories."
    exit 0
fi

echo "Found ${#env_files[@]} .env file(s):"
echo

# Arrays to store categorized files
declare -a known_files
declare -a unknown_files

# Categorize files
for file in "${env_files[@]}"; do
    # Normalize the path (remove leading ./)
    normalized_path="${file#./}"
    
    # Check if file is in known locations
    is_known=false
    for known in "${KNOWN_LOCATIONS[@]}"; do
        if [ "$normalized_path" == "$known" ]; then
            is_known=true
            break
        fi
    done
    
    if [ "$is_known" = true ]; then
        known_files+=("$file")
    else
        unknown_files+=("$file")
    fi
done

# Display known files
if [ ${#known_files[@]} -gt 0 ]; then
    echo -e "${GREEN}Known .env files (will be removed):${NC}"
    for file in "${known_files[@]}"; do
        echo "  $file"
    done
    echo
fi

# Display and confirm unknown files
if [ ${#unknown_files[@]} -gt 0 ]; then
    echo -e "${YELLOW}WARNING: Unknown .env files found:${NC}"
    for file in "${unknown_files[@]}"; do
        echo -e "  ${RED}$file${NC}"
    done
    echo
    echo -e "${YELLOW}These files are NOT in the known locations list!${NC}"
    read -p "Do you want to remove these unknown files? (yes/no): " confirm_unknown
    echo
else
    confirm_unknown="no"
fi

# Confirm removal of all files if there are any known files
if [ ${#known_files[@]} -gt 0 ]; then
    read -p "Proceed with removal of known .env files? (yes/no): " confirm_known
    echo
else
    confirm_known="no"
fi

# Remove files based on confirmations
removed_count=0

if [[ "$confirm_known" == "yes" ]]; then
    for file in "${known_files[@]}"; do
        rm -f "$file"
        echo -e "${GREEN}Removed:${NC} $file"
        ((removed_count++))
    done
fi

if [[ "$confirm_unknown" == "yes" ]]; then
    for file in "${unknown_files[@]}"; do
        rm -f "$file"
        echo -e "${GREEN}Removed:${NC} $file"
        ((removed_count++))
    done
fi

echo
echo "Total files removed: $removed_count"
