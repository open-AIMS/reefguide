#!/bin/bash

# copy-to-efs.sh - Upload local file/directory to EFS via EC2 instance using AWS SSM
# Usage: ./copy-to-efs.sh [--zip] <local_path> <remote_target> <s3_transfer_bucket> <ec2_instance_id>

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSM_TIMEOUT=300
MAX_RETRIES=3
RETRY_DELAY=5
COMMAND_POLL_INTERVAL=5

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Colored output functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Cleanup function
cleanup() {
    local exit_code=$?
    log_info "Cleaning up..."
    
    # Remove temporary files
    [[ -n "${TEMP_S3_KEY:-}" ]] && {
        log_info "Removing temporary S3 object: s3://${S3_BUCKET}/${TEMP_S3_KEY}"
        aws s3 rm "s3://${S3_BUCKET}/${TEMP_S3_KEY}" 2>/dev/null || log_warn "Failed to remove S3 object"
    }
    
    # Remove temporary local zip file
    [[ -n "${TEMP_ZIP_FILE:-}" ]] && [[ -f "${TEMP_ZIP_FILE}" ]] && {
        log_info "Removing temporary zip file: ${TEMP_ZIP_FILE}"
        rm -f "${TEMP_ZIP_FILE}" || log_warn "Failed to remove temporary zip file"
    }
    
    # Stop EC2 instance if we started it
    if [[ "${EC2_STARTED_BY_SCRIPT:-false}" == "true" ]]; then
        log_info "Stopping EC2 instance: $EC2_INSTANCE_ID"
        aws ec2 stop-instances --instance-ids "$EC2_INSTANCE_ID" >/dev/null 2>&1 || log_warn "Failed to stop EC2 instance"
    fi
}

# Error handler
error_handler() {
    local line_number=$1
    log_error "Script failed at line $line_number"
    cleanup
}

# Set up error handling
trap 'error_handler $LINENO' ERR
trap cleanup EXIT

# Validation function
validate_requirements() {
    log_info "Validating requirements..."
    
    # Check required commands
    local required_commands=("aws" "zip" "unzip")
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
    
    # Check if local path exists
    if [[ ! -e "$LOCAL_PATH" ]]; then
        log_error "Local path does not exist: $LOCAL_PATH"
        exit 1
    fi
    
    # Validate zip mode usage
    if [[ "$USE_ZIP" == "true" ]]; then
        if [[ ! -d "$LOCAL_PATH" ]]; then
            log_error "--zip mode can only be used with directories, not files"
            log_error "Local path '$LOCAL_PATH' is not a directory"
            exit 1
        fi
        log_info "Using zip mode for directory: $LOCAL_PATH"
    else
        if [[ -d "$LOCAL_PATH" ]]; then
            log_info "Uploading directory contents recursively (without zip): $LOCAL_PATH"
        else
            log_info "Uploading single file: $LOCAL_PATH"
        fi
    fi
    
    log_info "Requirements validation passed"
}

# Function to get EC2 instance state
get_instance_state() {
    local instance_id=$1
    aws ec2 describe-instances --instance-ids "$instance_id" \
        --query 'Reservations[0].Instances[0].State.Name' \
        --output text 2>/dev/null || echo "unknown"
}

# Function to check if instance is managed by SSM
check_ssm_managed() {
    local instance_id=$1
    local ping_status
    
    ping_status=$(aws ssm describe-instance-information \
        --filters "Key=InstanceIds,Values=$instance_id" \
        --query 'InstanceInformationList[0].PingStatus' \
        --output text 2>/dev/null || echo "None")
    
    if [[ "$ping_status" == "Online" ]]; then
        return 0
    else
        return 1
    fi
}

# Function to wait for SSM connectivity
wait_for_ssm() {
    local instance_id=$1
    
    log_info "Waiting for SSM connectivity..."
    
    local attempts=0
    while [[ $attempts -lt 30 ]]; do
        if check_ssm_managed "$instance_id"; then
            log_info "SSM connectivity established"
            return 0
        fi
        log_info "SSM not ready yet, waiting..."
        sleep 10
        ((attempts++))
    done
    
    log_error "SSM connectivity could not be established within timeout"
    exit 1
}

# Function to start EC2 instance
start_ec2_instance() {
    local instance_id=$1
    local current_state
    
    current_state=$(get_instance_state "$instance_id")
    log_info "Current EC2 instance state: $current_state"
    
    case "$current_state" in
        "running")
            log_info "EC2 instance is already running"
            ;;
        "stopped")
            log_info "Starting EC2 instance: $instance_id"
            aws ec2 start-instances --instance-ids "$instance_id" >/dev/null
            EC2_STARTED_BY_SCRIPT=true
            ;;
        "pending"|"stopping")
            log_info "EC2 instance is in transitional state: $current_state"
            ;;
        *)
            log_error "EC2 instance is in unexpected state: $current_state"
            exit 1
            ;;
    esac
    
    # Wait for instance to be running
    log_info "Waiting for EC2 instance to be running..."
    local attempts=0
    while [[ $attempts -lt 30 ]]; do
        current_state=$(get_instance_state "$instance_id")
        if [[ "$current_state" == "running" ]]; then
            log_info "EC2 instance is now running"
            break
        fi
        log_info "Instance state: $current_state, waiting..."
        sleep 10
        ((attempts++))
    done
    
    if [[ "$current_state" != "running" ]]; then
        log_error "EC2 instance failed to start within timeout"
        exit 1
    fi
    
    # Wait for SSM to be available
    wait_for_ssm "$instance_id"
}

# Function to create zip file from directory
create_zip_file() {
    local source_dir=$1
    local zip_filename=$2
    
    log_info "Creating zip file from directory: $source_dir"
    
    # Create zip file containing the directory contents (not the directory itself)
    if ! (cd "$source_dir" && zip -r "$zip_filename" . -x "*.DS_Store" "*/__pycache__/*" "*/.*"); then
        log_error "Failed to create zip file"
        exit 1
    fi
    
    local zip_size
    zip_size=$(du -h "$zip_filename" | cut -f1)
    log_info "Created zip file: $zip_filename (size: $zip_size)"
}

# Function to upload file/directory to S3
upload_to_s3() {
    local local_path=$1
    local s3_bucket=$2
    local s3_key=$3
    
    log_info "Uploading $local_path to s3://$s3_bucket/$s3_key"
    
    local attempts=0
    while [[ $attempts -lt $MAX_RETRIES ]]; do
        if [[ -f "$local_path" ]]; then
            # Upload single file
            if aws s3 cp "$local_path" "s3://$s3_bucket/$s3_key"; then
                log_info "File uploaded successfully to S3"
                return 0
            fi
        elif [[ -d "$local_path" ]]; then
            # Upload directory recursively
            if aws s3 cp "$local_path" "s3://$s3_bucket/$s3_key" --recursive; then
                log_info "Directory uploaded successfully to S3"
                return 0
            fi
        else
            log_error "Invalid path type: $local_path"
            exit 1
        fi
        
        ((attempts++))
        log_warn "Upload attempt $attempts failed, retrying in $RETRY_DELAY seconds..."
        sleep $RETRY_DELAY
    done
    
    log_error "Failed to upload to S3 after $MAX_RETRIES attempts"
    exit 1
}

# Function to execute SSM command and wait for completion
execute_ssm_command() {
    local instance_id=$1
    local commands=$2
    local description=$3
    
    log_info "Executing SSM command: $description"
    log_info "Command to execute: $commands"
    
    # Temporarily disable exit on error for better error handling
    set +e
    
    # Send the command
    local command_id
    local send_result
    local send_exit_code
    
    send_result=$(aws ssm send-command \
        --instance-ids "$instance_id" \
        --document-name "AWS-RunShellScript" \
        --parameters "commands=[\"$commands\"]" \
        --comment "$description" \
        --timeout-seconds $SSM_TIMEOUT \
        --output json 2>&1)
    send_exit_code=$?
    
    # Re-enable exit on error
    set -e
    
    if [[ $send_exit_code -ne 0 ]]; then
        log_error "Failed to send SSM command (exit code: $send_exit_code)"
        log_error "AWS CLI error: $send_result"
        exit 1
    fi
    
    # Check if jq is available and parse the response
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed"
        exit 1
    fi
    
    set +e
    command_id=$(echo "$send_result" | jq -r '.Command.CommandId' 2>/dev/null)
    local jq_exit_code=$?
    set -e
    
    if [[ $jq_exit_code -ne 0 ]] || [[ -z "$command_id" ]] || [[ "$command_id" == "null" ]]; then
        log_error "Failed to extract command ID from response"
        log_error "jq exit code: $jq_exit_code"
        log_error "Parsed command_id: '$command_id'"
        log_error "Raw response: $send_result"
        exit 1
    fi
    
    log_info "Command sent with ID: $command_id"
    
    # Wait for command completion with better error handling
    local status=""
    local attempts=0
    local max_attempts=$((SSM_TIMEOUT / COMMAND_POLL_INTERVAL))
    
    log_info "Starting to poll command status (will poll up to $max_attempts times, every $COMMAND_POLL_INTERVAL seconds)"
    
    while [[ $attempts -lt $max_attempts ]]; do
        attempts=$((attempts + 1))
        
        # Get command invocation with better error handling
        local invocation_result
        local invocation_exit_code

        invocation_result=$(aws ssm get-command-invocation \
            --command-id "$command_id" \
            --instance-id "$instance_id" \
            --output json 2>&1)
        invocation_exit_code=$?

        if [[ $invocation_exit_code -ne 0 ]]; then
            log_warn "Failed to get command invocation (attempt $attempts/$max_attempts, exit code: $invocation_exit_code)"
            log_warn "Error: $invocation_result"
            # If we can't get the invocation, treat it as still in progress
            status="InProgress"
        else
            set +e
            status=$(echo "$invocation_result" | jq -r '.Status' 2>/dev/null)
            local jq_status_exit=$?
            set -e
            
            if [[ $jq_status_exit -ne 0 ]] || [[ -z "$status" ]] || [[ "$status" == "null" ]]; then
                log_warn "Failed to parse status from invocation result (attempt $attempts/$max_attempts)"
                log_warn "Raw result: $invocation_result"
                status="InProgress"
            fi
        fi
        
        log_info "Poll attempt $attempts/$max_attempts - Status: $status"
        
        case "$status" in
            "Success")
                log_info "Command completed successfully after $attempts attempts"
                break
                ;;
            "InProgress"|"Pending"|"Delayed")
                log_info "Command still running... (attempt $attempts/$max_attempts)"
                if [[ $attempts -lt $max_attempts ]]; then
                    sleep $COMMAND_POLL_INTERVAL
                fi
                ;;
            "Failed"|"Cancelled"|"Cancelling"|"TimedOut")
                log_error "Command failed with status: $status"
                
                # Get detailed error and output information
                if [[ -n "$invocation_result" ]]; then
                    local error_output stdout_output
                    
                    set +e
                    error_output=$(echo "$invocation_result" | jq -r '.StandardErrorContent // "No error details available"' 2>/dev/null)
                    stdout_output=$(echo "$invocation_result" | jq -r '.StandardOutputContent // "No output available"' 2>/dev/null)
                    local status_details
                    status_details=$(echo "$invocation_result" | jq -r '.StatusDetails // "No status details available"' 2>/dev/null)
                    set -e
                    
                    log_error "Standard output: $stdout_output"
                    log_error "Standard error: $error_output"
                    log_error "Status details: $status_details"
                fi
                
                exit 1
                ;;
            *)
                log_warn "Unknown command status: $status (attempt $attempts/$max_attempts)"
                if [[ $attempts -lt $max_attempts ]]; then
                    sleep $COMMAND_POLL_INTERVAL
                fi
                ;;
        esac
    done
    
    # Final status check
    if [[ "$status" != "Success" ]]; then
        log_error "Command did not complete successfully after $max_attempts polling attempts"
        log_error "Final status: $status"
        
        # Try one more time to get detailed error information
        local final_invocation
        set +e
        final_invocation=$(aws ssm get-command-invocation \
            --command-id "$command_id" \
            --instance-id "$instance_id" \
            --output json 2>/dev/null)
        local final_exit=$?
        set -e
        
        if [[ $final_exit -eq 0 ]] && [[ -n "$final_invocation" ]]; then
            local final_error final_output
            set +e
            final_error=$(echo "$final_invocation" | jq -r '.StandardErrorContent // "No error details"' 2>/dev/null)
            final_output=$(echo "$final_invocation" | jq -r '.StandardOutputContent // "No output"' 2>/dev/null)
            set -e
            log_error "Final command output: $final_output"
            log_error "Final command error: $final_error"
        fi
        
        exit 1
    fi
    
    # Get and display command output
    local output_result
    set +e
    output_result=$(aws ssm get-command-invocation \
        --command-id "$command_id" \
        --instance-id "$instance_id" \
        --query 'StandardOutputContent' \
        --output text 2>/dev/null)
    local output_exit=$?
    set -e
    
    if [[ $output_exit -eq 0 ]] && [[ -n "$output_result" ]] && [[ "$output_result" != "None" ]] && [[ "$output_result" != "null" ]]; then
        log_info "Command output:"
        echo "$output_result" | sed 's/^/  /' | tee -a "$LOG_FILE"
    else
        if [[ $output_exit -ne 0 ]]; then
            log_warn "Could not retrieve command output (exit code: $output_exit)"
        else
            log_info "Command completed with no output"
        fi
    fi
}

# Function to transfer file from S3 to EFS
transfer_s3_to_efs_file() {
    local instance_id=$1
    local s3_bucket=$2
    local s3_key=$3
    local target_path=$4
    local is_zip=$5
    
    log_info "Transferring file from S3 to EFS on EC2 instance"
    
    # Step 1: Mount EFS
    execute_ssm_command "$instance_id" \
        "cd /home/ubuntu && sudo -u ubuntu ./mountefs.sh" \
        "Mount EFS filesystem"
    
    # Step 2: Create target directory
    local target_dir
    if [[ "$is_zip" == "true" ]]; then
        # For zip files, target_path is the directory where contents will be extracted
        target_dir="$target_path"
    else
        # For regular files, get the parent directory
        target_dir=$(dirname "$target_path")
    fi
    
    execute_ssm_command "$instance_id" \
        "sudo -u ubuntu mkdir -p /home/ubuntu/efs/$target_dir" \
        "Create target directory"
    
    if [[ "$is_zip" == "true" ]]; then
        # Step 3a: Download zip file to temporary location
        local temp_zip_name
        temp_zip_name=$(basename "$s3_key")
        execute_ssm_command "$instance_id" \
            "sudo -u ubuntu aws s3 cp s3://$s3_bucket/$s3_key /tmp/$temp_zip_name" \
            "Download zip file from S3"
        
        # Step 3b: Extract zip file to target directory
        execute_ssm_command "$instance_id" \
            "cd /home/ubuntu/efs/$target_path && sudo -u ubuntu unzip -o /tmp/$temp_zip_name" \
            "Extract zip file to EFS target directory"
        
        # Step 3c: Clean up temporary zip file
        execute_ssm_command "$instance_id" \
            "sudo rm -f /tmp/$temp_zip_name" \
            "Clean up temporary zip file"
        
        # Step 4: Verify extraction
        execute_ssm_command "$instance_id" \
            "sudo -u ubuntu ls -la /home/ubuntu/efs/$target_path" \
            "Verify zip extraction"
    else
        # Step 3: Download from S3 to EFS (regular file)
        execute_ssm_command "$instance_id" \
            "sudo -u ubuntu aws s3 cp s3://$s3_bucket/$s3_key /home/ubuntu/efs/$target_path" \
            "Download file from S3 to EFS"
        
        # Step 4: Verify file transfer
        execute_ssm_command "$instance_id" \
            "sudo -u ubuntu ls -la /home/ubuntu/efs/$target_path" \
            "Verify file transfer"
        
        # Step 5: Get file info
        execute_ssm_command "$instance_id" \
            "sudo -u ubuntu file /home/ubuntu/efs/$target_path && sudo -u ubuntu du -h /home/ubuntu/efs/$target_path" \
            "Get file information"
    fi
}

# Function to transfer directory from S3 to EFS (non-zip mode)
transfer_s3_to_efs_directory() {
    local instance_id=$1
    local s3_bucket=$2
    local s3_key_prefix=$3
    local target_path=$4
    
    log_info "Transferring directory from S3 to EFS on EC2 instance"
    
    # Step 1: Mount EFS
    execute_ssm_command "$instance_id" \
        "cd /home/ubuntu && sudo -u ubuntu ./mountefs.sh" \
        "Mount EFS filesystem"
    
    # Step 2: Create target directory
    execute_ssm_command "$instance_id" \
        "sudo -u ubuntu mkdir -p /home/ubuntu/efs/$target_path" \
        "Create target directory"
    
    # Step 3: Download directory from S3 to EFS
    execute_ssm_command "$instance_id" \
        "sudo -u ubuntu aws s3 cp s3://$s3_bucket/$s3_key_prefix /home/ubuntu/efs/$target_path --recursive" \
        "Download directory from S3 to EFS"
    
    # Step 4: Verify directory transfer
    execute_ssm_command "$instance_id" \
        "sudo -u ubuntu find /home/ubuntu/efs/$target_path -type f | head -10" \
        "Verify directory transfer (showing first 10 files)"
    
    # Step 5: Get directory info
    execute_ssm_command "$instance_id" \
        "sudo -u ubuntu du -sh /home/ubuntu/efs/$target_path" \
        "Get directory size information"
}

# Main function
main() {
    log_info "Starting copy-to-efs script (SSM version)"
    log_info "Local path: $LOCAL_PATH"
    log_info "Remote target: $REMOTE_TARGET"
    log_info "S3 bucket: $S3_BUCKET"
    log_info "EC2 instance: $EC2_INSTANCE_ID"
    log_info "Use zip mode: $USE_ZIP"
    
    validate_requirements
    
    # Check if instance is already SSM-managed
    if check_ssm_managed "$EC2_INSTANCE_ID"; then
        log_info "Instance is already SSM-managed and online"
    else
        log_info "Instance is not SSM-managed or not online, will start it"
    fi
    
    # Determine what we're uploading and prepare
    local upload_path="$LOCAL_PATH"
    local is_directory=false
    local is_zip_transfer=false
    
    if [[ -d "$LOCAL_PATH" ]]; then
        is_directory=true
        if [[ "$USE_ZIP" == "true" ]]; then
            # Create zip file from directory
            TEMP_ZIP_FILE="${SCRIPT_DIR}/temp-$(basename "$LOCAL_PATH")-$(date +%s)-$$.zip"
            create_zip_file "$LOCAL_PATH" "$TEMP_ZIP_FILE"
            upload_path="$TEMP_ZIP_FILE"
            is_zip_transfer=true
        fi
    fi
    
    # Generate S3 key
    if [[ "$is_zip_transfer" == "true" ]]; then
        TEMP_S3_KEY="temp-transfers/$(basename "$upload_path")"
    elif [[ "$is_directory" == "true" ]]; then
        TEMP_S3_KEY="temp-transfers/$(basename "$LOCAL_PATH")-$(date +%s)-$$/"
    else
        TEMP_S3_KEY="temp-transfers/$(basename "$LOCAL_PATH")-$(date +%s)-$$"
    fi
    
    # Start EC2 instance and upload to S3 in parallel
    log_info "Starting parallel operations: EC2 startup and S3 upload"
    
    # Start EC2 instance in background
    start_ec2_instance "$EC2_INSTANCE_ID" &
    local ec2_pid=$!
    
    # Upload to S3 in background
    upload_to_s3 "$upload_path" "$S3_BUCKET" "$TEMP_S3_KEY" &
    local s3_pid=$!
    
    # Wait for both operations to complete
    log_info "Waiting for EC2 startup to complete..."
    wait $ec2_pid
    log_info "EC2 startup completed"
    
    log_info "Waiting for S3 upload to complete..."
    wait $s3_pid
    log_info "S3 upload completed"
    
    # Transfer from S3 to EFS
    if [[ "$is_zip_transfer" == "true" ]]; then
        transfer_s3_to_efs_file "$EC2_INSTANCE_ID" "$S3_BUCKET" "$TEMP_S3_KEY" "$REMOTE_TARGET" "true"
        log_info "Zip file extracted successfully!"
        log_info "Directory contents location on EFS: /home/ubuntu/efs/$REMOTE_TARGET"
    elif [[ "$is_directory" == "true" ]]; then
        transfer_s3_to_efs_directory "$EC2_INSTANCE_ID" "$S3_BUCKET" "$TEMP_S3_KEY" "$REMOTE_TARGET"
        log_info "Directory transfer completed successfully!"
        log_info "Directory location on EFS: /home/ubuntu/efs/$REMOTE_TARGET"
    else
        transfer_s3_to_efs_file "$EC2_INSTANCE_ID" "$S3_BUCKET" "$TEMP_S3_KEY" "$REMOTE_TARGET" "false"
        log_info "File transfer completed successfully!"
        log_info "File location on EFS: /home/ubuntu/efs/$REMOTE_TARGET"
    fi
}

# Usage function
usage() {
    echo "Usage: $0 [--zip] <local_path> <remote_target> <s3_transfer_bucket> <ec2_instance_id>"
    echo ""
    echo "Options:"
    echo "  --zip               Zip directory before transfer and extract at destination"
    echo "                      (can only be used with directories, not files)"
    echo ""
    echo "Arguments:"
    echo "  local_path          Local file or directory to upload"
    echo "  remote_target       Target path in EFS (relative to /home/ubuntu/efs/)"
    echo "  s3_transfer_bucket  S3 bucket for temporary transfer storage"
    echo "  ec2_instance_id     EC2 instance ID with EFS access"
    echo ""
    echo "Environment variables:"
    echo "  AWS_REGION      - AWS region (default: us-east-1)"
    echo "  SSM_TIMEOUT     - SSM command timeout in seconds (default: 300)"
    echo ""
    echo "Examples:"
    echo "  # Upload a single file"
    echo "  $0 ./myfile.txt data/uploads/myfile.txt my-bucket i-1234567890abcdef0"
    echo ""
    echo "  # Upload a directory recursively (preserves structure)"
    echo "  $0 ./data_folder target/data my-bucket i-1234567890abcdef0"
    echo ""
    echo "  # Upload directory contents as zip (more efficient for many small files)"
    echo "  $0 --zip ./data_folder target/data my-bucket i-1234567890abcdef0"
    echo ""
    echo "  # Result of zip mode: ./data/{1,2,3}.txt -> EFS:/target/data/{1,2,3}.txt"
    echo ""
    echo "Prerequisites:"
    echo "  - EC2 instance must have SSM agent installed (default on most AMIs)"
    echo "  - EC2 instance must have IAM role with AmazonSSMManagedInstanceCore policy"
    echo "  - mountefs.sh script must exist at /home/ubuntu/mountefs.sh on the instance"
    echo "  - AWS CLI must be configured with appropriate permissions"
    echo "  - zip and unzip commands must be available locally and on EC2 instance"
}

# Parse command line arguments
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

if [[ ${#ARGS[@]} -ne 4 ]]; then
    usage
    exit 1
fi

LOCAL_PATH="${ARGS[0]}"
REMOTE_TARGET="${ARGS[1]}"
S3_BUCKET="${ARGS[2]}"
EC2_INSTANCE_ID="${ARGS[3]}"

# Environment variables with defaults
AWS_REGION="${AWS_REGION:-us-east-1}"
SSM_TIMEOUT="${SSM_TIMEOUT:-300}"

# Global variables
EC2_STARTED_BY_SCRIPT=false
TEMP_S3_KEY=""
TEMP_ZIP_FILE=""

# Run main function
main
