#!/usr/bin/env python3

"""
get-efs-target.py - Extract EFS connection info from CloudFormation stack
Usage: ./get-efs-target.py [stack-name]
Output: <transfer_bucket_name> <ec2_instance_id>
"""

import sys
import os
import json
import subprocess
import re
from pathlib import Path
from utils import log_info, log_error


def validate_requirements():
    """Check that required commands are available and AWS is configured"""
    required_commands = ["aws", "jq"]

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


def slugify_stack_name(text):
    """
    Slugify stack name for CloudFormation output key
    Must match the TypeScript slugify function behavior
    """
    # Convert to lowercase and remove non-alphanumeric characters
    slugified = re.sub(r'[^a-z0-9]', '', text.lower())

    # Prefix with 'n' if starts with number
    if slugified and slugified[0].isdigit():
        slugified = f"n{slugified}"

    # Fallback if string becomes empty
    if not slugified:
        slugified = "empty"

    return slugified


def get_stack_name_from_config():
    """Get stack name from config file using CONFIG_FILE_NAME environment variable"""
    config_file_name = os.environ.get("CONFIG_FILE_NAME")

    if not config_file_name:
        log_error("CONFIG_FILE_NAME environment variable not set")
        log_error(
            "Please set CONFIG_FILE_NAME to your config file name (e.g., 'test.json')")
        sys.exit(1)

    config_path = Path("configs") / config_file_name

    if not config_path.exists():
        log_error(f"Config file not found: {config_path}")
        log_error(
            "Please ensure the config file exists and CONFIG_FILE_NAME is correct")
        sys.exit(1)

    log_info(f"Reading config from: {config_path}")

    try:
        with open(config_path, 'r') as f:
            config = json.load(f)

        stack_name = config.get('stackName')
        if not stack_name:
            log_error(
                f"Could not extract stackName from config file: {config_path}")
            log_error(
                "Please ensure the config file contains a 'stackName' field")
            sys.exit(1)

        log_info(f"Found stack name in config: {stack_name}")
        return stack_name

    except json.JSONDecodeError as e:
        log_error(f"Invalid JSON in config file {config_path}: {e}")
        sys.exit(1)
    except Exception as e:
        log_error(f"Error reading config file {config_path}: {e}")
        sys.exit(1)


def get_stack_output(stack_name, output_key):
    """Get output value from CloudFormation stack"""
    log_info(f"Getting output '{output_key}' from stack: {stack_name}")

    cmd = [
        "aws", "cloudformation", "describe-stacks",
        "--stack-name", stack_name,
        "--query", f"Stacks[0].Outputs[?OutputKey=='{output_key}'].OutputValue",
        "--output", "text"
    ]

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True)
        output_value = result.stdout.strip()

        if not output_value or output_value == "None":
            log_error(
                f"Output key '{output_key}' not found in stack '{stack_name}'")
            return None

        return output_value

    except subprocess.CalledProcessError as e:
        log_error("cloudformation describe-stacks error:")
        log_error(e.stderr)
        return None


def parse_connection_info(json_value):
    """Parse the JSON output value to extract connection information"""
    log_info("Parsing connection info JSON")

    try:
        data = json.loads(json_value)

        service_instance_id = data.get('serviceInstanceId')
        transfer_bucket_name = data.get('transferBucketName')

        if not service_instance_id:
            log_error(
                f"Could not extract serviceInstanceId from JSON: {json_value}")
            sys.exit(1)

        if not transfer_bucket_name:
            log_error(
                f"Could not extract transferBucketName from JSON: {json_value}")
            sys.exit(1)

        log_info(f"Extracted serviceInstanceId: {service_instance_id}")
        log_info(f"Extracted transferBucketName: {transfer_bucket_name}")

        # Output in the format expected by copy-to-efs.sh
        return f"{transfer_bucket_name} {service_instance_id}"

    except json.JSONDecodeError as e:
        log_error(f"Invalid JSON in output value: {e}")
        log_error(f"Raw value: {json_value}")
        sys.exit(1)


def show_usage():
    """Display usage information"""
    print(f"""Usage: {sys.argv[0]} [stack-name]

Extract EFS connection information from CloudFormation stack output.
Looks for output key '<slugified-stack-name>efnConnectionInfo' containing JSON with:
  - serviceInstanceId: EC2 instance ID for EFS access
  - transferBucketName: S3 bucket name for temporary transfers

Arguments:
  stack-name    CloudFormation stack name (optional)
                If not provided, will read from config file using CONFIG_FILE_NAME

Output format:
  <transfer_bucket_name> <ec2_instance_id>

Environment variables:
  CONFIG_FILE_NAME    Config file name (e.g., 'test.json')
                      Script will look for configs/${{CONFIG_FILE_NAME}}
  AWS_REGION          AWS region (uses AWS CLI default if not set)

Examples:
  # Use config file
  CONFIG_FILE_NAME=test.json {sys.argv[0]}

  # Override with specific stack name
  {sys.argv[0]} my-efs-stack

  # Use with copy script
  CONFIG_FILE_NAME=prod.json {sys.argv[0]} | xargs ./copy-to-efs.py ./myfile.txt target/path

Config file format (configs/${{CONFIG_FILE_NAME}}):
  {{
    "stackName": "your-cloudformation-stack-name",
    ...
  }}""")


def main():
    """Main function"""
    # Parse command line arguments
    if len(sys.argv) > 1 and sys.argv[1] in ['-h', '--help']:
        show_usage()
        sys.exit(0)

    log_info("Starting get-efs-target script")

    validate_requirements()

    # Determine stack name
    if len(sys.argv) > 1:
        stack_name = sys.argv[1]
        log_info(f"Using stack name from argument: {stack_name}")
    else:
        log_info("No stack name provided as argument, reading from config file")
        stack_name = get_stack_name_from_config()

    log_info(f"Using stack: {stack_name}")

    # Slugify the stack name for the output key
    slugified_stack_name = slugify_stack_name(stack_name)
    log_info(f"Slugified stack name: {slugified_stack_name}")

    # Construct the output key using the slugified stack name
    output_key = f"{slugified_stack_name}efnConnectionInfo"
    log_info(f"Looking for output key: {output_key}")

    # Get the output value
    output_value = get_stack_output(stack_name, output_key)
    if output_value is None:
        sys.exit(1)

    log_info(f"Raw output value: {output_value}")

    # Parse and output the connection info
    connection_info = parse_connection_info(output_value)
    print(connection_info)


if __name__ == "__main__":
    main()
