#!/usr/bin/env python3
"""
connect-efs.py - Connect to EFS management instance via SSM interactive session
Usage: ./connect-efs.py [stack-name]
"""

import sys
import os
import json
import subprocess
import time
from pathlib import Path
from utils import log_info, log_error, log_blue


def validate_requirements():
    """Check that required commands are available and AWS is configured"""
    required_commands = ["aws"]

    for cmd in required_commands:
        try:
            subprocess.run([cmd, "--version"], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            log_error(f"Required command '{cmd}' not found")
            sys.exit(1)

    # Check AWS CLI configuration
    try:
        subprocess.run(["aws", "sts", "get-caller-identity"],
                       capture_output=True, check=True)
    except subprocess.CalledProcessError:
        log_error("AWS CLI not configured or credentials invalid")
        sys.exit(1)


def get_instance_state(instance_id):
    """Get the current state of an EC2 instance"""
    try:
        result = subprocess.run([
            "aws", "ec2", "describe-instances",
            "--instance-ids", instance_id,
            "--query", "Reservations[0].Instances[0].State.Name",
            "--output", "text"
        ], capture_output=True, text=True, check=True)

        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return "unknown"


def check_ssm_managed(instance_id):
    """Check if instance is managed by SSM and online"""
    try:
        result = subprocess.run([
            "aws", "ssm", "describe-instance-information",
            "--filters", f"Key=InstanceIds,Values={instance_id}",
            "--query", "InstanceInformationList[0].PingStatus",
            "--output", "text"
        ], capture_output=True, text=True, check=True)

        ping_status = result.stdout.strip()
        return ping_status == "Online"
    except subprocess.CalledProcessError:
        return False


def start_instance_if_needed(instance_id):
    """Start EC2 instance if it's not running and wait for it to be ready"""
    current_state = get_instance_state(instance_id)
    log_info(f"Current EC2 instance state: {current_state}")

    if current_state == "running":
        log_info("Instance is already running")
        return

    if current_state == "stopped":
        log_info(f"Starting EC2 instance: {instance_id}")
        try:
            subprocess.run([
                "aws", "ec2", "start-instances",
                "--instance-ids", instance_id
            ], capture_output=True, check=True)
        except subprocess.CalledProcessError as e:
            log_error(f"Failed to start instance: {e}")
            sys.exit(1)

    if current_state in ["stopped", "pending", "stopping"]:
        if current_state in ["pending", "stopping"]:
            log_info(f"Instance is in transitional state: {current_state}")

        log_info("Waiting for instance to start...")

        for attempt in range(30):  # 5 minute timeout
            current_state = get_instance_state(instance_id)
            if current_state == "running":
                log_info("Instance is now running")
                return

            log_info(f"Instance state: {current_state}, waiting...")
            time.sleep(10)

        log_error("Instance failed to start within timeout")
        sys.exit(1)

    if current_state not in ["running", "stopped", "pending", "stopping"]:
        log_error(f"Instance is in unexpected state: {current_state}")
        sys.exit(1)


def wait_for_ssm(instance_id):
    """Wait for SSM connectivity to be established"""
    log_info("Waiting for SSM connectivity...")

    for attempt in range(30):  # 5 minute timeout
        if check_ssm_managed(instance_id):
            log_info("SSM connectivity established")
            return

        log_info("SSM not ready yet, waiting...")
        time.sleep(10)

    log_error("SSM connectivity could not be established within timeout")
    sys.exit(1)


def get_instance_details(instance_id):
    """Get and display instance details"""
    log_info("Getting instance details...")

    try:
        result = subprocess.run([
            "aws", "ec2", "describe-instances",
            "--instance-ids", instance_id,
            "--query", "Reservations[0].Instances[0]",
            "--output", "json"
        ], capture_output=True, text=True, check=True)

        instance_info = json.loads(result.stdout)

        if not instance_info:
            log_error(f"Could not get instance details for: {instance_id}")
            sys.exit(1)

        instance_type = instance_info.get('InstanceType', 'unknown')
        platform = instance_info.get('Platform', 'linux')
        private_ip = instance_info.get('PrivateIpAddress', 'unknown')
        placement = instance_info.get('Placement', {})
        az = placement.get('AvailabilityZone', 'unknown')

        log_info(f"Instance Type: {instance_type}")
        log_info(f"Platform: {platform}")
        log_info(f"Private IP: {private_ip}")
        log_info(f"Availability Zone: {az}")

    except (subprocess.CalledProcessError, json.JSONDecodeError) as e:
        log_error(f"Failed to get instance details: {e}")
        sys.exit(1)


def get_efs_connection_info(stack_name=None):
    """Get EFS connection info using get-efs-target.py"""
    script_dir = Path(__file__).parent
    get_efs_script = script_dir / "get-efs-target.py"

    if not get_efs_script.exists():
        log_error(f"get-efs-target.py not found at: {get_efs_script}")
        sys.exit(1)

    try:
        cmd = [str(get_efs_script)]
        if stack_name:
            cmd.append(stack_name)

        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        log_error("Failed to get EFS connection information")
        if e.stderr:
            log_error(e.stderr)
        sys.exit(1)


def start_interactive_session(instance_id):
    """Start interactive SSM session with the instance"""
    log_blue(f"Starting interactive SSM session with instance: {instance_id}")
    log_blue(
        "You will be connected as ssm-user. Use 'sudo su - ubuntu' to switch to ubuntu user.")
    log_blue("Type 'exit' to end the session.")
    print("")

    # Start the interactive session using exec equivalent
    try:
        os.execvp("aws", ["aws", "ssm", "start-session",
                  "--target", instance_id])
    except OSError as e:
        log_error(f"Failed to start SSM session: {e}")
        sys.exit(1)


def show_usage():
    """Display usage information"""
    print(f"""Usage: {sys.argv[0]} [stack-name]

Connect to EFS management instance via AWS SSM interactive session.
Uses the same connection discovery as get-efs-target.py

Arguments:
  stack-name    CloudFormation stack name (optional)
                If not provided, will read from config file using CONFIG_FILE_NAME

Environment variables:
  CONFIG_FILE_NAME    Config file name (e.g., 'test.json')
                      Script will look for configs/${{CONFIG_FILE_NAME}}
  AWS_REGION          AWS region (uses AWS CLI default if not set)

Prerequisites:
  - AWS Session Manager plugin must be installed
  - EC2 instance must have SSM agent and appropriate IAM role
  - Your AWS credentials must have SSM permissions

Examples:
  # Use config file
  CONFIG_FILE_NAME=test.json {sys.argv[0]}

  # Override with specific stack name
  {sys.argv[0]} my-efs-stack

Session commands:
  sudo su - ubuntu          # Switch to ubuntu user
  ./mountefs.sh            # Mount EFS (if not already mounted)
  ls -la /home/ubuntu/efs/  # Browse EFS contents
  exit                     # End session

Required IAM permissions:
  - ssm:StartSession
  - ssm:DescribeInstanceInformation
  - ec2:DescribeInstances
  - ec2:StartInstances (if instance is stopped)""")


def main():
    """Main function"""
    # Parse command line arguments
    if len(sys.argv) > 1 and sys.argv[1] in ['-h', '--help']:
        show_usage()
        sys.exit(0)

    stack_name = sys.argv[1] if len(sys.argv) > 1 else None

    log_info("Starting connect-efs script")

    validate_requirements()

    # Get EFS connection info
    log_info("Getting EFS connection information...")
    efs_info = get_efs_connection_info(stack_name)

    # Parse the info (format: "transfer_bucket ec2_instance_id")
    parts = efs_info.strip().split()
    if len(parts) != 2:
        log_error("Could not parse EFS connection information")
        sys.exit(1)

    transfer_bucket, ec2_instance_id = parts

    if not ec2_instance_id:
        log_error("Could not extract EC2 instance ID from connection info")
        sys.exit(1)

    log_info(f"Target EC2 instance: {ec2_instance_id}")
    log_info(f"Transfer bucket: {transfer_bucket}")

    # Get instance details
    get_instance_details(ec2_instance_id)

    # Ensure instance is running
    start_instance_if_needed(ec2_instance_id)

    # Wait for SSM connectivity
    wait_for_ssm(ec2_instance_id)

    # Start interactive session
    start_interactive_session(ec2_instance_id)


if __name__ == "__main__":
    main()
