#!/bin/bash

# connect-efs.sh - Connect to EFS management instance via SSM interactive session
# Usage: ./connect-efs.sh [stack-name]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_blue() {
    echo -e "${BLUE}[CONNECT]${NC} $1" >&2
}

# Validation function
validate_requirements() {
    # Check required commands
    local required_commands=("aws")
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

# Function to start EC2 instance if needed
start_instance_if_needed() {
    local instance_id=$1
    local current_state
    
    current_state=$(get_instance_state "$instance_id")
    log_info "Current EC2 instance state: $current_state"
    
    case "$current_state" in
        "running")
            log_info "Instance is already running"
            ;;
        "stopped")
            log_info "Starting EC2 instance: $instance_id"
            aws ec2 start-instances --instance-ids "$instance_id" >/dev/null
            
            log_info "Waiting for instance to start..."
            local attempts=0
            while [[ $attempts -lt 30 ]]; do
                current_state=$(get_instance_state "$instance_id")
                if [[ "$current_state" == "running" ]]; then
                    log_info "Instance is now running"
                    break
                fi
                log_info "Instance state: $current_state, waiting..."
                sleep 10
                ((attempts++))
            done
            
            if [[ "$current_state" != "running" ]]; then
                log_error "Instance failed to start within timeout"
                exit 1
            fi
            ;;
        "pending"|"stopping")
            log_info "Instance is in transitional state: $current_state"
            log_info "Waiting for instance to be ready..."
            
            local attempts=0
            while [[ $attempts -lt 30 ]]; do
                current_state=$(get_instance_state "$instance_id")
                if [[ "$current_state" == "running" ]]; then
                    log_info "Instance is now running"
                    break
                fi
                log_info "Instance state: $current_state, waiting..."
                sleep 10
                ((attempts++))
            done
            
            if [[ "$current_state" != "running" ]]; then
                log_error "Instance did not reach running state within timeout"
                exit 1
            fi
            ;;
        *)
            log_error "Instance is in unexpected state: $current_state"
            exit 1
            ;;
    esac
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

# Function to get instance details
get_instance_details() {
    local instance_id=$1
    
    log_info "Getting instance details..."
    
    local instance_info
    instance_info=$(aws ec2 describe-instances --instance-ids "$instance_id" \
        --query 'Reservations[0].Instances[0]' \
        --output json 2>/dev/null)
    
    if [[ -z "$instance_info" || "$instance_info" == "null" ]]; then
        log_error "Could not get instance details for: $instance_id"
        exit 1
    fi
    
    local instance_type platform private_ip az
    instance_type=$(echo "$instance_info" | jq -r '.InstanceType // "unknown"')
    platform=$(echo "$instance_info" | jq -r '.Platform // "linux"')
    private_ip=$(echo "$instance_info" | jq -r '.PrivateIpAddress // "unknown"')
    az=$(echo "$instance_info" | jq -r '.Placement.AvailabilityZone // "unknown"')
    
    log_info "Instance Type: $instance_type"
    log_info "Platform: $platform"
    log_info "Private IP: $private_ip"
    log_info "Availability Zone: $az"
}

# Function to start interactive session
start_interactive_session() {
    local instance_id=$1
    
    log_blue "Starting interactive SSM session with instance: $instance_id"
    log_blue "You will be connected as ssm-user. Use 'sudo su - ubuntu' to switch to ubuntu user."
    log_blue "Type 'exit' to end the session."
    echo ""
    
    # Start the interactive session
    exec aws ssm start-session --target "$instance_id"
}

# Main function
main() {
    local stack_name="${1:-}"
    
    log_info "Starting connect-efs script"
    
    validate_requirements
    
    # Get EFS connection info
    log_info "Getting EFS connection information..."
    
    local efs_info
    if ! efs_info=$("$SCRIPT_DIR/get-efs-target.sh" $stack_name); then
        log_error "Failed to get EFS connection information"
        exit 1
    fi
    
    # Parse the info (format: "transfer_bucket ec2_instance_id")
    local transfer_bucket ec2_instance_id
    read -r transfer_bucket ec2_instance_id <<< "$efs_info"
    
    if [[ -z "$ec2_instance_id" ]]; then
        log_error "Could not extract EC2 instance ID from connection info"
        exit 1
    fi
    
    log_info "Target EC2 instance: $ec2_instance_id"
    log_info "Transfer bucket: $transfer_bucket"
    
    # Get instance details
    get_instance_details "$ec2_instance_id"
    
    # Ensure instance is running
    start_instance_if_needed "$ec2_instance_id"
    
    # Wait for SSM connectivity
    wait_for_ssm "$ec2_instance_id"
    
    # Start interactive session
    start_interactive_session "$ec2_instance_id"
}

# Usage function
usage() {
    echo "Usage: $0 [stack-name]"
    echo ""
    echo "Connect to EFS management instance via AWS SSM interactive session."
    echo "Uses the same connection discovery as get-efs-target.sh"
    echo ""
    echo "Arguments:"
    echo "  stack-name    CloudFormation stack name (optional)"
    echo "                If not provided, will read from config file using CONFIG_FILE_NAME"
    echo ""
    echo "Environment variables:"
    echo "  CONFIG_FILE_NAME    Config file name (e.g., 'test.json')"
    echo "                      Script will look for configs/\${CONFIG_FILE_NAME}"
    echo "  AWS_REGION          AWS region (uses AWS CLI default if not set)"
    echo ""
    echo "Prerequisites:"
    echo "  - AWS Session Manager plugin must be installed"
    echo "  - EC2 instance must have SSM agent and appropriate IAM role"
    echo "  - Your AWS credentials must have SSM permissions"
    echo ""
    echo "Examples:"
    echo "  # Use config file"
    echo "  CONFIG_FILE_NAME=test.json $0"
    echo ""
    echo "  # Override with specific stack name"
    echo "  $0 my-efs-stack"
    echo ""
    echo "Session commands:"
    echo "  sudo su - ubuntu          # Switch to ubuntu user"
    echo "  ./mountefs.sh            # Mount EFS (if not already mounted)"
    echo "  ls -la /home/ubuntu/efs/  # Browse EFS contents"
    echo "  exit                     # End session"
    echo ""
    echo "Required IAM permissions:"
    echo "  - ssm:StartSession"
    echo "  - ssm:DescribeInstanceInformation"
    echo "  - ec2:DescribeInstances"
    echo "  - ec2:StartInstances (if instance is stopped)"
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
