#!/bin/bash

# build-capacity-env.sh - Build .env file from capacity manager task definition
# Usage: ./build-capacity-env.sh [stack-name] [output-file]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
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

    local tmp_err
    tmp_err=$(mktemp)

    local output_value
    output_value=$(aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
        --output text 2> "$tmp_err")

    # if command exited with non-zero error code
    if [[ $? -ne 0 ]]; then
        log_error "cloudformation describe-stacks error:"
        cat "$tmp_err" >&2
        rm -f "$tmp_err"
        return 1
    fi
    rm -f "$tmp_err"

    if [[ -z "$output_value" || "$output_value" == "None" ]]; then
        log_error "Output key '$output_key' not found in stack '$stack_name'"
        return 1
    fi
    
    echo "$output_value"
}

# Function to get task definition details
get_task_definition() {
    local task_def_arn="$1"
    
    log_info "Getting task definition details: $task_def_arn"
    
    local task_def_json
    task_def_json=$(aws ecs describe-task-definition --task-definition "$task_def_arn" --output json)
    
    if [[ -z "$task_def_json" ]]; then
        log_error "Failed to get task definition details"
        exit 1
    fi
    
    echo "$task_def_json"
}

# Function to extract field and secret ARN from AWS Secrets Manager valueFrom string
parse_secrets_arn() {
    local value_from="$1"
    
    # Validate input
    if [[ -z "$value_from" ]]; then
        echo "Error: No input provided" >&2
        return 1
    fi
    
    # Check if it's a valid secrets manager ARN format
    if [[ ! "$value_from" =~ ^arn:aws:secretsmanager: ]]; then
        echo "Error: Not a valid AWS Secrets Manager ARN" >&2
        return 1
    fi
    
    # The format should be: arn:aws:secretsmanager:region:account:secret:name-suffix:field::
    # We need to extract the field that appears before the final ::
    
    if [[ "$value_from" == *"::"* ]]; then
        # Remove the trailing ::
        local without_trailing="${value_from%::}"
        
        # Extract the field (everything after the last colon in the remaining string)
        local field="${without_trailing##*:}"
        
        # Extract the base secret ARN (everything except the field and trailing ::)
        local secret_arn="${without_trailing%:*}"
        
        # Validate that we actually extracted a field
        if [[ -z "$field" ]]; then
            # No field found, treat as whole secret
            local secret_arn="$value_from"
            local field=""
        fi
    else
        # No :: found, treat as complete secret ARN without field specification
        local secret_arn="$value_from"
        local field=""
    fi
    
    # Export results for caller to use
    export PARSED_SECRET_ARN="$secret_arn"
    export PARSED_FIELD="$field"
}

# Function to fetch secret value
get_secret_value() {
    local secret_arn="$1"
    local json_key="$2"
    
    log_info "Fetching secret: $secret_arn (key: $json_key)"
    
    local secret_json
    local aws_error
    aws_error=$(mktemp)
    
    # Fetch the secret with error handling
    secret_json=$(aws secretsmanager get-secret-value --secret-id "$secret_arn" --query 'SecretString' --output text 2>"$aws_error")
    local aws_exit_code=$?
    
    if [[ $aws_exit_code -ne 0 ]]; then
        log_error "Failed to fetch secret: $secret_arn"
        log_error "AWS CLI error:"
        cat "$aws_error" >&2
        rm -f "$aws_error"
        return 1
    fi
    rm -f "$aws_error"
    
    if [[ -z "$secret_json" || "$secret_json" == "None" ]]; then
        log_error "Empty or null secret value returned for: $secret_arn"
        return 1
    fi
    
    # If no JSON key specified, return the raw secret
    if [[ -z "$json_key" ]]; then
        echo "$secret_json"
        return 0
    fi
    
    # Parse JSON to extract the specific key
    local secret_value
    local jq_error
    jq_error=$(mktemp)
    
    secret_value=$(echo "$secret_json" | jq -r --arg key "$json_key" '.[$key] // empty' 2>"$jq_error")
    local jq_exit_code=$?
    
    if [[ $jq_exit_code -ne 0 ]]; then
        log_error "Failed to parse secret JSON for key '$json_key' in secret: $secret_arn"
        log_error "jq error:"
        cat "$jq_error" >&2
        log_error "Raw secret content: $secret_json"
        rm -f "$jq_error"
        return 1
    fi
    rm -f "$jq_error"
    
    if [[ -z "$secret_value" || "$secret_value" == "null" ]]; then
        log_error "Secret key '$json_key' not found or is null in secret: $secret_arn"
        log_error "Available keys in secret JSON:"
        echo "$secret_json" | jq -r 'keys[]?' 2>/dev/null | sed 's/^/  /' >&2 || log_error "Could not parse secret as JSON"
        return 1
    fi
    
    echo "$secret_value"
}

# Function to check if file exists and prompt for overwrite
check_overwrite_file() {
    local output_file="$1"
    
    if [[ -f "$output_file" ]]; then
        log_warn "Output file already exists: $output_file"
        echo -n "Do you want to overwrite it? [y/N]: " >&2
        read -r response
        case "$response" in
            [yY]|[yY][eE][sS])
                log_info "Overwriting existing file"
                return 0
                ;;
            *)
                log_info "Operation cancelled by user"
                exit 0
                ;;
        esac
    fi
}

# Function to build .env file from task definition
build_env_file() {
    local task_def_json="$1"
    local output_file="$2"
    
    log_info "Building .env file: $output_file"
    
    # Check if file exists and get permission to overwrite
    check_overwrite_file "$output_file"
    
    # Ensure output directory exists
    local output_dir
    output_dir=$(dirname "$output_file")
    if [[ ! -d "$output_dir" ]]; then
        log_info "Creating output directory: $output_dir"
        mkdir -p "$output_dir"
    fi
    
    # Create or truncate the output file
    > "$output_file"
    
    # Add header comment
    echo "# Generated .env file from capacity manager task definition" >> "$output_file"
    echo "# Generated on: $(date)" >> "$output_file"
    echo "" >> "$output_file"
    
    # Extract environment variables from the first container definition
    local container_def
    container_def=$(echo "$task_def_json" | jq -r '.taskDefinition.containerDefinitions[0]')
    
    if [[ -z "$container_def" || "$container_def" == "null" ]]; then
        log_error "No container definitions found in task definition"
        exit 1
    fi
    
    # Process regular environment variables
    local env_vars
    env_vars=$(echo "$container_def" | jq -r '.environment[]? // empty')
    
    if [[ -n "$env_vars" ]]; then
        log_info "Processing regular environment variables..."
        echo "$container_def" | jq -r '.environment[]? | select(.name != null and .value != null) | "\(.name)=\(.value)"' >> "$output_file"
    fi
    
    # Process secrets (environment variables from AWS Secrets Manager)
    local secrets
    secrets=$(echo "$container_def" | jq -r '.secrets[]? // empty')
    
    if [[ -n "$secrets" ]]; then
        log_info "Processing secrets..."
        
        # Get all secret entries
        local secret_count
        secret_count=$(echo "$container_def" | jq -r '.secrets | length')
        
        if [[ "$secret_count" -gt 0 ]]; then
            for ((i=0; i<secret_count; i++)); do
                local secret_entry
                secret_entry=$(echo "$container_def" | jq -r --argjson idx "$i" '.secrets[$idx]')
                
                local env_name secret_value_from
                env_name=$(echo "$secret_entry" | jq -r '.name // empty')
                secret_value_from=$(echo "$secret_entry" | jq -r '.valueFrom // empty')
                
                if [[ -z "$env_name" || -z "$secret_value_from" ]]; then
                    log_warn "Skipping invalid secret entry: $secret_entry"
                    continue
                fi
                
                log_info "Processing secret: $env_name -> $secret_value_from"
                
                # Parse the secret ARN to extract the secret ARN and field
                if parse_secrets_arn "$secret_value_from"; then
                    local secret_arn="$PARSED_SECRET_ARN"
                    local json_key="$PARSED_FIELD"
                    
                    log_info "Parsed secret ARN: $secret_arn"
                    log_info "Parsed field: '$json_key'"
                    
                    local secret_value
                    if secret_value=$(get_secret_value "$secret_arn" "$json_key"); then
                        echo "$env_name=$secret_value" >> "$output_file"
                        log_info "Successfully resolved secret for: $env_name"
                    else
                        log_warn "Failed to get secret value for $env_name, adding placeholder"
                        echo "# $env_name=<FAILED_TO_FETCH_SECRET>" >> "$output_file"
                    fi
                else
                    log_warn "Failed to parse secret ARN for $env_name: $secret_value_from"
                    echo "# $env_name=<FAILED_TO_PARSE_SECRET_ARN>" >> "$output_file"
                fi
                
                # Clear the exported variables for next iteration
                unset PARSED_SECRET_ARN PARSED_FIELD
            done
        fi
    fi
    
    # Add footer
    echo "" >> "$output_file"
    echo "# End of generated .env file" >> "$output_file"
    
    local line_count
    line_count=$(wc -l < "$output_file")
    log_info "Generated .env file with $line_count lines"
}

# Main function
main() {
    local stack_name="${1:-}"
    local output_file="${2:-../capacity-manager/.env}"
    
    log_info "Starting build-capacity-env script"
    
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
    log_info "Output file: $output_file"
    
    # Slugify the stack name for the output key
    local slugified_stack_name
    slugified_stack_name=$(slugify_stack_name "$stack_name")
    log_info "Slugified stack name: $slugified_stack_name"
    
    # Construct the output key using the slugified stack name
    local output_key="${slugified_stack_name}capacityManagerTaskDfn"
    log_info "Looking for output key: $output_key"
    
    # Get the task definition ARN from CloudFormation output
    local task_def_arn
    if ! task_def_arn=$(get_stack_output "$stack_name" "$output_key"); then
        exit 1
    fi
    
    log_info "Task definition ARN: $task_def_arn"
    
    # Get task definition details
    local task_def_json
    if ! task_def_json=$(get_task_definition "$task_def_arn"); then
        exit 1
    fi
    
    # Build the .env file
    build_env_file "$task_def_json" "$output_file"
    
    log_info "Successfully created .env file: $output_file"
    log_info "You can now use this file with: source $output_file"
}

# Usage function
usage() {
    echo "Usage: $0 [stack-name] [output-file]"
    echo ""
    echo "Build .env file from capacity manager ECS task definition."
    echo "Fetches task definition from CloudFormation output, extracts environment variables"
    echo "and secrets, resolves secret values from AWS Secrets Manager."
    echo ""
    echo "Arguments:"
    echo "  stack-name      CloudFormation stack name (optional)"
    echo "                  If not provided, will read from config file using CONFIG_FILE_NAME"
    echo "  output-file     Output .env file path (default: ../capacity-manager/.env)"
    echo ""
    echo "Environment variables:"
    echo "  CONFIG_FILE_NAME    Config file name (e.g., 'test.json')"
    echo "                      Script will look for configs/\${CONFIG_FILE_NAME}"
    echo "  AWS_REGION          AWS region (uses AWS CLI default if not set)"
    echo ""
    echo "Examples:"
    echo "  # Use config file, default output file"
    echo "  CONFIG_FILE_NAME=test.json $0"
    echo ""
    echo "  # Use config file, custom output file"
    echo "  CONFIG_FILE_NAME=prod.json $0 '' prod-capacity.env"
    echo ""
    echo "  # Override with specific stack name"
    echo "  $0 my-stack-name"
    echo ""
    echo "  # Custom stack and output file"
    echo "  $0 my-stack-name ./configs/capacity.env"
    echo ""
    echo "Usage after generation:"
    echo "  source capacity-manager.env    # Load variables into current shell"
    echo "  export \$(cat capacity-manager.env | xargs)    # Alternative loading method"
    echo ""
    echo "Prerequisites:"
    echo "  - AWS CLI configured with appropriate permissions"
    echo "  - IAM permissions for:"
    echo "    - cloudformation:DescribeStacks"
    echo "    - ecs:DescribeTaskDefinition"
    echo "    - secretsmanager:GetSecretValue"
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
