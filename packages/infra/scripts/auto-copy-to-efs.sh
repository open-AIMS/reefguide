#!/bin/bash

# copy-to-efs-auto.sh - Auto-discover EFS target and copy files
# Usage: ./copy-to-efs-auto.sh [--zip] <local_path> <remote_target> [stack-name]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

usage() {
    echo "Usage: $0 [--zip] <local_path> <remote_target> [stack-name]"
    echo ""
    echo "Auto-discover EFS connection info from CloudFormation and copy files."
    echo ""
    echo "Options:"
    echo "  --zip               Zip directory before transfer"
    echo ""
    echo "Arguments:"
    echo "  local_path          Local file or directory to upload"
    echo "  remote_target       Target path in EFS"
    echo "  stack-name          CloudFormation stack name (optional, auto-discovered if not provided)"
    echo ""
    echo "Examples:"
    echo "  $0 ./myfile.txt data/uploads/myfile.txt"
    echo "  $0 --zip ./data_folder target/data my-stack-name"
}

# Parse arguments
USE_ZIP=false
ARGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --zip)
            USE_ZIP=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        -*)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
        *)
            ARGS+=("$1")
            shift
            ;;
    esac
done

if [[ ${#ARGS[@]} -lt 2 ]] || [[ ${#ARGS[@]} -gt 3 ]]; then
    usage
    exit 1
fi

LOCAL_PATH="${ARGS[0]}"
REMOTE_TARGET="${ARGS[1]}"
STACK_NAME="${ARGS[2]:-}"

# Get EFS connection info
log_info "Discovering EFS connection information..."

if ! EFS_INFO=$("$SCRIPT_DIR/get-efs-target.sh" $STACK_NAME); then
    log_error "Failed to get EFS connection information"
    exit 1
fi

# Parse the info
read -r TRANSFER_BUCKET EC2_INSTANCE_ID <<< "$EFS_INFO"

log_info "Using transfer bucket: $TRANSFER_BUCKET"
log_info "Using EC2 instance: $EC2_INSTANCE_ID"

# Build the copy command
COPY_CMD=("$SCRIPT_DIR/copy-to-efs.sh")

if [[ "$USE_ZIP" == "true" ]]; then
    COPY_CMD+=("--zip")
fi

COPY_CMD+=("$LOCAL_PATH" "$REMOTE_TARGET" "$TRANSFER_BUCKET" "$EC2_INSTANCE_ID")

# Execute the copy
log_info "Executing: ${COPY_CMD[*]}"
exec "${COPY_CMD[@]}"
