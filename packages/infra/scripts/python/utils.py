#!/usr/bin/env python3
"""
Utility functions for EFS scripts
"""

import sys
from datetime import datetime

class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    NC = '\033[0m'  # No Color

def log(message):
    """Log a message with timestamp to stderr"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {message}", file=sys.stderr)


def log_info(message):
    """Log an info message to stderr"""
    print(f"{Colors.GREEN}[INFO]{Colors.NC} {message}", file=sys.stderr)


def log_warn(message):
    """Log a warning message to stderr"""
    print(f"{Colors.YELLOW}[WARN]{Colors.NC} {message}", file=sys.stderr)


def log_error(message):
    """Log an error message to stderr"""
    print(f"{Colors.RED}[ERROR]{Colors.NC} {message}", file=sys.stderr)
