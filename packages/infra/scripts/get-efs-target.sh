#!/bin/bash

# get-efs-target.sh - Extract EFS connection info from CloudFormation stack
# Usage: ./get-efs-target.sh [stack-name]
# Output: <transfer_bucket_name> <ec2_instance_id>

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/get-efs-target.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function (to stderr so it doesn't interfere with output)
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >&2
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Validation function
validate_requirements() {
    # Check required commands
    local required_commands=("aws" "jq")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "Required command '$cmd' not found"
            exit 1
        fi
    done
    
    # Check AWS CLI configuration
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS CLI not configured or credentials invalid"
        exit 1
    fi
}

# Function to slugify stack name for CloudFormation output key
# Must match the TypeScript slugify function behavior
slugify_stack_name() {
    local text="$1"
    
    # Convert to lowercase and remove non-alphanumeric characters
    local slugified
    slugified=$(echo "$text" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')
    
    # Prefix with 'n' if starts with number
    if [[ "$slugified" =~ ^[0-9] ]]; then
        slugified="n${slugified}"
    fi
    
    # Fallback if string becomes empty
    if [[ -z "$slugified" ]]; then
        slugified="empty"
    fi
    
    echo "$slugified"
}

get_stack_name_from_config() {
    local config_file_name="${CONFIG_FILE_NAME:-}"
    
    if [[ -z "$config_file_name" ]]; then
        log_error "CONFIG_FILE_NAME environment variable not set"
        log_error "Please set CONFIG_FILE_NAME to your config file name (e.g., 'test.json')"
        exit 1
    fi
    
    local config_path="configs/${config_file_name}"
    
    if [[ ! -f "$config_path" ]]; then
        log_error "Config file not found: $config_path"
        log_error "Please ensure the config file exists and CONFIG_FILE_NAME is correct"
        exit 1
    fi
    
    log_info "Reading config from: $config_path"
    
    local stack_name
    stack_name=$(jq -r '.stackName // empty' "$config_path" 2>/dev/null)
    
    if [[ -z "$stack_name" ]]; then
        log_error "Could not extract stackName from config file: $config_path"
        log_error "Please ensure the config file contains a 'stackName' field"
        exit 1
    fi
    
    log_info "Found stack name in config: $stack_name"
    echo "$stack_name"
}

# Function to get stack output
get_stack_output() {
    local stack_name="$1"
    local output_key="$2"
    
    log_info "Getting output '$output_key' from stack: $stack_name"
    
    local output_value
    output_value=$(aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
        --output text 2>/dev/null)
    
    if [[ -z "$output_value" || "$output_value" == "None" ]]; then
        log_error "Output key '$output_key' not found in stack '$stack_name'"
        return 1
    fi
    
    echo "$output_value"
}

# Function to parse the JSON output value
parse_connection_info() {
    local json_value="$1"
    
    log_info "Parsing connection info JSON"
    
    # Parse the JSON to extract values
    local service_instance_id transfer_bucket_name
    
    service_instance_id=$(echo "$json_value" | jq -r '.serviceInstanceId // empty' 2>/dev/null)
    transfer_bucket_name=$(echo "$json_value" | jq -r '.transferBucketName // empty' 2>/dev/null)
    
    if [[ -z "$service_instance_id" ]]; then
        log_error "Could not extract serviceInstanceId from JSON: $json_value"
        exit 1
    fi
    
    if [[ -z "$transfer_bucket_name" ]]; then
        log_error "Could not extract transferBucketName from JSON: $json_value"
        exit 1
    fi
    
    log_info "Extracted serviceInstanceId: $service_instance_id"
    log_info "Extracted transferBucketName: $transfer_bucket_name"
    
    # Output in the format expected by copy-to-efs.sh
    echo "$transfer_bucket_name $service_instance_id"
}

# Main function
main() {
    local stack_name="${1:-}"
    
    log_info "Starting get-efs-target script"
    
    validate_requirements
    
    # If no stack name provided as argument, get it from config file
    if [[ -z "$stack_name" ]]; then
        log_info "No stack name provided as argument, reading from config file"
        if ! stack_name=$(get_stack_name_from_config); then
            exit 1
        fi
    else
        log_info "Using stack name from argument: $stack_name"
    fi
    
    log_info "Using stack: $stack_name"
    
    # Slugify the stack name for the output key
    local slugified_stack_name
    slugified_stack_name=$(slugify_stack_name "$stack_name")
    log_info "Slugified stack name: $slugified_stack_name"
    
    # Construct the output key using the slugified stack name
    local output_key="${slugified_stack_name}efnConnectionInfo"
    log_info "Looking for output key: $output_key"
    
    # Get the output value
    local output_value
    if ! output_value=$(get_stack_output "$stack_name" "$output_key"); then
        exit 1
    fi
    
    log_info "Raw output value: $output_value"
    
    # Parse and output the connection info
    parse_connection_info "$output_value"
}

# Usage function
usage() {
    echo "Usage: $0 [stack-name]"
    echo ""
    echo "Extract EFS connection information from CloudFormation stack output."
    echo "Looks for output key '<slugified-stack-name>efnConnectionInfo' containing JSON with:"
    echo "  - serviceInstanceId: EC2 instance ID for EFS access"
    echo "  - transferBucketName: S3 bucket name for temporary transfers"
    echo ""
    echo "Arguments:"
    echo "  stack-name    CloudFormation stack name (optional)"
    echo "                If not provided, will read from config file using CONFIG_FILE_NAME"
    echo ""
    echo "Output format:"
    echo "  <transfer_bucket_name> <ec2_instance_id>"
    echo ""
    echo "Environment variables:"
    echo "  CONFIG_FILE_NAME    Config file name (e.g., 'test.json')"
    echo "                      Script will look for configs/\${CONFIG_FILE_NAME}"
    echo "  AWS_REGION          AWS region (uses AWS CLI default if not set)"
    echo ""
    echo "Examples:"
    echo "  # Use config file"
    echo "  CONFIG_FILE_NAME=test.json $0"
    echo ""
    echo "  # Override with specific stack name"
    echo "  $0 my-efs-stack"
    echo ""
    echo "  # Use with copy script"
    echo "  CONFIG_FILE_NAME=prod.json $0 | xargs ./copy-to-efs.sh ./myfile.txt target/path"
    echo ""
    echo "Config file format (configs/\${CONFIG_FILE_NAME}):"
    echo "  {"
    echo "    \"stackName\": \"your-cloudformation-stack-name\","
    echo "    ..."
    echo "  }"
}

# Parse command line arguments
case "${1:-}" in
    -h|--help)
        usage
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
