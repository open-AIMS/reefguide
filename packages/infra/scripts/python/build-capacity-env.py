#!/usr/bin/env python3

"""
build-capacity-env.py - Build .env file from capacity manager task definition

Usage: ./build-capacity-env.py [stack-name] [output-file]
"""

import sys
import os
import json
import subprocess
import re
from datetime import datetime
from pathlib import Path
from utils import log_info, log_warn, log_error


def validate_requirements():
    """Check required commands and AWS configuration"""
    required_commands = ["aws"]
    for cmd in required_commands:
        if not which(cmd):
            log_error(f"Required command '{cmd}' not found")
            sys.exit(1)

    # Check AWS CLI configuration
    try:
        result = subprocess.run(['aws', 'sts', 'get-caller-identity'],
                                capture_output=True, check=True)
    except subprocess.CalledProcessError:
        log_error("AWS CLI not configured or credentials invalid")
        sys.exit(1)


def which(program):
    """Check if program exists in PATH"""
    def is_exe(fpath):
        return os.path.isfile(fpath) and os.access(fpath, os.X_OK)

    fpath, fname = os.path.split(program)
    if fpath:
        if is_exe(program):
            return program
    else:
        for path in os.environ["PATH"].split(os.pathsep):
            exe_file = os.path.join(path, program)
            if is_exe(exe_file):
                return exe_file
    return None


def slugify_stack_name(text):
    """Slugify stack name for CloudFormation output key"""
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
    """Get stack name from config file"""
    config_file_name = os.getenv('CONFIG_FILE_NAME')

    if not config_file_name:
        log_error("CONFIG_FILE_NAME environment variable not set")
        log_error(
            "Please set CONFIG_FILE_NAME to your config file name (e.g., 'test.json')")
        sys.exit(1)

    config_path = Path('configs') / config_file_name

    if not config_path.exists():
        log_error(f"Config file not found: {config_path}")
        log_error(
            "Please ensure the config file exists and CONFIG_FILE_NAME is correct")
        sys.exit(1)

    log_info(f"Reading config from: {config_path}")

    try:
        with open(config_path, 'r') as f:
            config_data = json.load(f)

        stack_name = config_data.get('stackName')
        if not stack_name:
            log_error(
                f"Could not extract stackName from config file: {config_path}")
            log_error(
                "Please ensure the config file contains a 'stackName' field")
            sys.exit(1)

        log_info(f"Found stack name in config: {stack_name}")
        return stack_name

    except json.JSONDecodeError as e:
        log_error(f"Invalid JSON in config file: {e}")
        sys.exit(1)
    except Exception as e:
        log_error(f"Error reading config file: {e}")
        sys.exit(1)


def get_stack_output(stack_name, output_key):
    """Get stack output from CloudFormation"""
    log_info(f"Getting output '{output_key}' from stack: {stack_name}")

    try:
        result = subprocess.run([
            'aws', 'cloudformation', 'describe-stacks',
            '--stack-name', stack_name,
            '--query', f"Stacks[0].Outputs[?OutputKey=='{output_key}'].OutputValue",
            '--output', 'text'
        ], capture_output=True, text=True, check=True)

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


def get_task_definition(task_def_arn):
    """Get task definition details"""
    log_info(f"Getting task definition details: {task_def_arn}")

    try:
        result = subprocess.run([
            'aws', 'ecs', 'describe-task-definition',
            '--task-definition', task_def_arn,
            '--output', 'json'
        ], capture_output=True, text=True, check=True)

        return json.loads(result.stdout)

    except subprocess.CalledProcessError as e:
        log_error("Failed to get task definition details")
        log_error(e.stderr)
        return None
    except json.JSONDecodeError as e:
        log_error(f"Failed to parse task definition JSON: {e}")
        return None


def parse_secrets_arn(value_from):
    """Extract field and secret ARN from AWS Secrets Manager valueFrom string"""
    if not value_from:
        return None, None

    # Check if it's a valid secrets manager ARN format
    if not value_from.startswith('arn:aws:secretsmanager:'):
        return None, None

    # The format should be: arn:aws:secretsmanager:region:account:secret:name-suffix:field::
    if '::' in value_from:
        # Remove the trailing ::
        without_trailing = value_from.rstrip('::')

        # Find the last colon and split
        if ':' in without_trailing:
            secret_arn, field = without_trailing.rsplit(':', 1)
            return secret_arn, field if field else None

    # No :: found or no field, treat as complete secret ARN
    return value_from, None


def get_secret_value(secret_arn, json_key=None):
    """Fetch secret value from AWS Secrets Manager"""
    log_info(f"Fetching secret: {secret_arn} (key: {json_key})")

    try:
        result = subprocess.run([
            'aws', 'secretsmanager', 'get-secret-value',
            '--secret-id', secret_arn,
            '--query', 'SecretString',
            '--output', 'text'
        ], capture_output=True, text=True, check=True)

        secret_json = result.stdout.strip()

        if not secret_json or secret_json == "None":
            log_error(f"Empty or null secret value returned for: {secret_arn}")
            return None

        # If no JSON key specified, return the raw secret
        if not json_key:
            return secret_json

        # Parse JSON to extract the specific key
        try:
            secret_data = json.loads(secret_json)
            secret_value = secret_data.get(json_key)

            if secret_value is None:
                log_error(
                    f"Secret key '{json_key}' not found or is null in secret: {secret_arn}")
                log_error("Available keys in secret JSON:")
                for key in secret_data.keys():
                    log_error(f"  {key}")
                return None

            return str(secret_value)

        except json.JSONDecodeError as e:
            log_error(
                f"Failed to parse secret JSON for key '{json_key}' in secret: {secret_arn}")
            log_error(f"JSON error: {e}")
            log_error(f"Raw secret content: {secret_json}")
            return None

    except subprocess.CalledProcessError as e:
        log_error(f"Failed to fetch secret: {secret_arn}")
        log_error(e.stderr)
        return None


def check_overwrite_file(output_file):
    """Check if file exists and prompt for overwrite"""
    if os.path.exists(output_file):
        log_warn(f"Output file already exists: {output_file}")
        response = input("Do you want to overwrite it? [y/N]: ")
        if response.lower() not in ['y', 'yes']:
            log_info("Operation cancelled by user")
            sys.exit(0)
        log_info("Overwriting existing file")


def build_env_file(task_def_json, output_file):
    """Build .env file from task definition"""
    log_info(f"Building .env file: {output_file}")

    # Check if file exists and get permission to overwrite
    check_overwrite_file(output_file)

    # Ensure output directory exists
    output_dir = os.path.dirname(output_file)
    if output_dir and not os.path.exists(output_dir):
        log_info(f"Creating output directory: {output_dir}")
        os.makedirs(output_dir, exist_ok=True)

    try:
        with open(output_file, 'w') as f:
            # Add header comment
            f.write("# Generated .env file from capacity manager task definition\n")
            f.write(f"# Generated on: {datetime.now()}\n")
            f.write("\n")

            # Extract environment variables from the first container definition
            container_defs = task_def_json.get(
                'taskDefinition', {}).get('containerDefinitions', [])
            if not container_defs:
                log_error("No container definitions found in task definition")
                sys.exit(1)

            container_def = container_defs[0]

            # Process regular environment variables
            env_vars = container_def.get('environment', [])
            if env_vars:
                log_info("Processing regular environment variables...")
                for env_var in env_vars:
                    name = env_var.get('name')
                    value = env_var.get('value')
                    if name and value is not None:
                        f.write(f"{name}={value}\n")

            # Process secrets (environment variables from AWS Secrets Manager)
            secrets = container_def.get('secrets', [])
            if secrets:
                log_info("Processing secrets...")

                for secret_entry in secrets:
                    env_name = secret_entry.get('name')
                    secret_value_from = secret_entry.get('valueFrom')

                    if not env_name or not secret_value_from:
                        log_warn(
                            f"Skipping invalid secret entry: {secret_entry}")
                        continue

                    log_info(
                        f"Processing secret: {env_name} -> {secret_value_from}")

                    # Parse the secret ARN to extract the secret ARN and field
                    secret_arn, json_key = parse_secrets_arn(secret_value_from)

                    if secret_arn:
                        log_info(f"Parsed secret ARN: {secret_arn}")
                        log_info(f"Parsed field: '{json_key}'")

                        secret_value = get_secret_value(secret_arn, json_key)
                        if secret_value is not None:
                            f.write(f"{env_name}={secret_value}\n")
                            log_info(
                                f"Successfully resolved secret for: {env_name}")
                        else:
                            log_warn(
                                f"Failed to get secret value for {env_name}, adding placeholder")
                            f.write(f"# {env_name}=<FAILED_TO_FETCH_SECRET>\n")
                    else:
                        log_warn(
                            f"Failed to parse secret ARN for {env_name}: {secret_value_from}")
                        f.write(f"# {env_name}=<FAILED_TO_PARSE_SECRET_ARN>\n")

            # Add footer
            f.write("\n")
            f.write("# End of generated .env file\n")

        # Count lines in the file
        with open(output_file, 'r') as f:
            line_count = len(f.readlines())

        log_info(f"Generated .env file with {line_count} lines")

    except Exception as e:
        log_error(f"Error writing to output file: {e}")
        sys.exit(1)


def usage():
    """Print usage information"""
    print("Usage: build-capacity-env.py [stack-name] [output-file]")
    print("")
    print("Build .env file from capacity manager ECS task definition.")
    print("Fetches task definition from CloudFormation output, extracts environment variables")
    print("and secrets, resolves secret values from AWS Secrets Manager.")
    print("")
    print("Arguments:")
    print("  stack-name      CloudFormation stack name (optional)")
    print("                  If not provided, will read from config file using CONFIG_FILE_NAME")
    print("  output-file     Output .env file path (default: ../capacity-manager/.env)")
    print("")
    print("Environment variables:")
    print("  CONFIG_FILE_NAME    Config file name (e.g., 'test.json')")
    print(
        "                      Script will look for configs/${CONFIG_FILE_NAME}")
    print("  AWS_REGION          AWS region (uses AWS CLI default if not set)")
    print("")
    print("Examples:")
    print("  # Use config file, default output file")
    print("  CONFIG_FILE_NAME=test.json ./build-capacity-env.py")
    print("")
    print("  # Use config file, custom output file")
    print("  CONFIG_FILE_NAME=prod.json ./build-capacity-env.py '' prod-capacity.env")
    print("")
    print("  # Override with specific stack name")
    print("  ./build-capacity-env.py my-stack-name")
    print("")
    print("  # Custom stack and output file")
    print("  ./build-capacity-env.py my-stack-name ./configs/capacity.env")
    print("")
    print("Usage after generation:")
    print("  source capacity-manager.env    # Load variables into current shell")
    print("  export $(cat capacity-manager.env | xargs)    # Alternative loading method")
    print("")
    print("Prerequisites:")
    print("  - AWS CLI configured with appropriate permissions")
    print("  - IAM permissions for:")
    print("    - cloudformation:DescribeStacks")
    print("    - ecs:DescribeTaskDefinition")
    print("    - secretsmanager:GetSecretValue")
    print("")
    print("Config file format (configs/${CONFIG_FILE_NAME}):")
    print("  {")
    print("    \"stackName\": \"your-cloudformation-stack-name\",")
    print("    ...")
    print("  }")


def main():
    """Main function"""
    # Parse command line arguments
    if len(sys.argv) > 1 and sys.argv[1] in ['-h', '--help']:
        usage()
        sys.exit(0)

    stack_name = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else None
    output_file = sys.argv[2] if len(
        sys.argv) > 2 else "../capacity-manager/.env"

    log_info("Starting build-capacity-env script")

    validate_requirements()

    # If no stack name provided as argument, get it from config file
    if not stack_name:
        log_info("No stack name provided as argument, reading from config file")
        stack_name = get_stack_name_from_config()
    else:
        log_info(f"Using stack name from argument: {stack_name}")

    log_info(f"Using stack: {stack_name}")
    log_info(f"Output file: {output_file}")

    # Slugify the stack name for the output key
    slugified_stack_name = slugify_stack_name(stack_name)
    log_info(f"Slugified stack name: {slugified_stack_name}")

    # Construct the output key using the slugified stack name
    output_key = f"{slugified_stack_name}capacityManagerTaskDfn"
    log_info(f"Looking for output key: {output_key}")

    # Get the task definition ARN from CloudFormation output
    task_def_arn = get_stack_output(stack_name, output_key)
    if not task_def_arn:
        sys.exit(1)

    log_info(f"Task definition ARN: {task_def_arn}")

    # Get task definition details
    task_def_json = get_task_definition(task_def_arn)
    if not task_def_json:
        sys.exit(1)

    # Build the .env file
    build_env_file(task_def_json, output_file)

    log_info(f"Successfully created .env file: {output_file}")
    log_info(f"You can now use this file with: source {output_file}")


if __name__ == "__main__":
    main()
