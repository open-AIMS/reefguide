#!/bin/bash

# ReefGuide Development Environment Setup Script
# This script sets up the complete development environment for ReefGuide
# including Node.js, dependencies, database, MinIO, and services

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NODE_VERSION="24"
REQUIRED_DOCKER_COMPOSE_VERSION="2.0.0"
DB_READY_TIMEOUT=60
MINIO_READY_TIMEOUT=60
API_DIR="packages/web-api"
S3_BUCKET_NAME="reefguide-dev"
MINIO_ENDPOINT="http://localhost:9000"
MINIO_ROOT_USER="minioadmin"
MINIO_ROOT_PASSWORD="minioadmin"

# Cache configuration
CACHE_DIR="$HOME/.cache/reefguide"
MC_CACHED="$CACHE_DIR/mc"

# Node manager variables
NODE_MANAGER=""
NODE_MANAGER_CMD=""

# Script flags
CLEAR_DB=false
CLEANUP_ON_EXIT=false
SKIP_DOCKER=false
SKIP_DEPS=false

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Error handler
error_exit() {
    log_error "$1"
    exit 1
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Version comparison function
version_ge() {
    printf '%s\n%s\n' "$2" "$1" | sort -V -C
}

# Detect available Node.js version manager
detect_node_manager() {
    log_info "Detecting Node.js version manager..."
    
    # Check for fnm first (it's faster and more modern)
    if command_exists fnm; then
        NODE_MANAGER="fnm"
        NODE_MANAGER_CMD="fnm"
        log_info "Found fnm: $(fnm --version)"
        return 0
    fi
    
    # Check for fnm in common locations if not in PATH
    for fnm_path in "$HOME/.fnm/fnm" "$HOME/.local/bin/fnm" "/usr/local/bin/fnm"; do
        if [ -x "$fnm_path" ]; then
            NODE_MANAGER="fnm"
            NODE_MANAGER_CMD="$fnm_path"
            log_info "Found fnm at: $fnm_path"
            return 0
        fi
    done
    
    # Check for nvm
    if command_exists nvm; then
        NODE_MANAGER="nvm"
        NODE_MANAGER_CMD="nvm"
        log_info "Found nvm (already loaded)"
        return 0
    fi
    
    # Check for nvm script
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        NODE_MANAGER="nvm"
        NODE_MANAGER_CMD="nvm"
        log_info "Found nvm script at: $HOME/.nvm/nvm.sh"
        return 0
    fi
    
    # Check for nvm in other common locations
    for nvm_path in "$HOME/.config/nvm/nvm.sh" "/usr/local/nvm/nvm.sh"; do
        if [ -s "$nvm_path" ]; then
            NODE_MANAGER="nvm"
            NODE_MANAGER_CMD="nvm"
            log_info "Found nvm script at: $nvm_path"
            return 0
        fi
    done
    
    # No Node.js version manager found
    NODE_MANAGER=""
    NODE_MANAGER_CMD=""
    return 1
}

# Setup Node.js using fnm
setup_fnm() {
    log_info "Setting up Node.js ${NODE_VERSION} using fnm..."
    
    # Initialize fnm environment if needed
    if ! command_exists node || ! command_exists npm; then
        log_info "Initializing fnm environment..."
        eval "$($NODE_MANAGER_CMD env --use-on-cd)"
    fi
    
    # Install Node.js version
    log_info "Installing Node.js ${NODE_VERSION}..."
    $NODE_MANAGER_CMD install "$NODE_VERSION" || error_exit "Failed to install Node.js ${NODE_VERSION}"
    
    # Use the installed version
    log_info "Using Node.js ${NODE_VERSION}..."
    $NODE_MANAGER_CMD use "$NODE_VERSION" || error_exit "Failed to use Node.js ${NODE_VERSION}"
    
    # Verify installation
    if ! command_exists node; then
        log_info "Re-initializing fnm environment..."
        eval "$($NODE_MANAGER_CMD env --use-on-cd)"
    fi
    
    log_success "Node.js $(node --version) is now active"
}

# Setup Node.js using nvm
setup_nvm() {
    log_info "Setting up Node.js ${NODE_VERSION} using nvm..."
    
    # Source nvm if it exists but isn't loaded
    if [ -s "$HOME/.nvm/nvm.sh" ] && ! command_exists nvm; then
        log_info "Loading nvm..."
        source "$HOME/.nvm/nvm.sh"
        NODE_MANAGER_CMD="nvm"
    elif [ -s "$HOME/.config/nvm/nvm.sh" ] && ! command_exists nvm; then
        log_info "Loading nvm from config directory..."
        source "$HOME/.config/nvm/nvm.sh"
        NODE_MANAGER_CMD="nvm"
    elif [ -s "/usr/local/nvm/nvm.sh" ] && ! command_exists nvm; then
        log_info "Loading nvm from /usr/local..."
        source "/usr/local/nvm/nvm.sh"
        NODE_MANAGER_CMD="nvm"
    fi
    
    # Install and use Node.js version
    log_info "Installing Node.js ${NODE_VERSION}..."
    $NODE_MANAGER_CMD install "$NODE_VERSION" || error_exit "Failed to install Node.js ${NODE_VERSION}"
    
    log_info "Using Node.js ${NODE_VERSION}..."
    $NODE_MANAGER_CMD use "$NODE_VERSION" || error_exit "Failed to use Node.js ${NODE_VERSION}"
    
    log_success "Node.js $(node --version) is now active"
}

# Check and setup Node.js version manager
setup_node_manager() {
    if ! detect_node_manager; then
        log_error "No Node.js version manager found!"
        echo
        log_error "Please install either fnm or nvm:"
        echo
        echo "  For fnm (recommended - faster and more modern):"
        echo "    curl -fsSL https://fnm.vercel.app/install | bash"
        echo "    # or"
        echo "    cargo install fnm"
        echo "    # or"
        echo "    brew install fnm"
        echo
        echo "  For nvm:"
        echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
        echo
        echo "  Then restart your terminal and run this script again."
        exit 1
    fi
    
    log_success "Using $NODE_MANAGER for Node.js version management"
    
    # Setup Node.js using the detected manager
    case "$NODE_MANAGER" in
        "fnm")
            setup_fnm
            ;;
        "nvm")
            setup_nvm
            ;;
        *)
            error_exit "Unknown Node.js version manager: $NODE_MANAGER"
            ;;
    esac
}

# Check Docker and Docker Compose
check_docker() {
    if [ "$SKIP_DOCKER" = true ]; then
        log_info "Skipping Docker checks (--skip-docker flag)"
        return 0
    fi
    
    log_info "Checking Docker installation..."
    
    if ! command_exists docker; then
        error_exit "Docker is not installed. Please install Docker Desktop or Docker Engine."
    fi
    
    if ! docker info >/dev/null 2>&1; then
        error_exit "Docker daemon is not running. Please start Docker."
    fi
    
    # Check Docker Compose (new version or legacy)
    if command_exists "docker-compose"; then
        COMPOSE_CMD="docker-compose"
        COMPOSE_VERSION=$(docker-compose --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    elif docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
        COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || docker compose version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    else
        error_exit "Docker Compose is not available. Please install Docker Compose."
    fi
    
    if ! version_ge "$COMPOSE_VERSION" "$REQUIRED_DOCKER_COMPOSE_VERSION"; then
        log_warning "Docker Compose version $COMPOSE_VERSION is older than recommended $REQUIRED_DOCKER_COMPOSE_VERSION"
    fi
    
    log_success "Docker and Docker Compose are ready (version: $COMPOSE_VERSION)"
}

# Install global dependencies
install_global_deps() {
    if [ "$SKIP_DEPS" = true ]; then
        log_info "Skipping global dependencies installation (--skip-deps flag)"
        return 0
    fi
    
    log_info "Installing global dependencies..."
    
    # Check if pnpm is already installed
    if command_exists pnpm; then
        log_info "pnpm is already installed ($(pnpm --version))"
    else
        log_info "Installing pnpm globally..."
        npm install -g pnpm || error_exit "Failed to install pnpm"
    fi
    
    # Check if turbo is available
    if ! command_exists turbo && ! npx turbo --version >/dev/null 2>&1; then
        log_warning "Turbo is not globally installed. Will use npx turbo."
    fi
    
    log_success "Global dependencies are ready"
}

# Install project dependencies
install_project_deps() {
    if [ "$SKIP_DEPS" = true ]; then
        log_info "Skipping project dependencies installation (--skip-deps flag)"
        return 0
    fi
    
    log_info "Installing project dependencies..."
    
    if [ ! -f "package.json" ]; then
        error_exit "package.json not found. Are you in the correct directory?"
    fi
    
    pnpm install || error_exit "Failed to install project dependencies"
    log_success "Project dependencies installed"
}

# Start Docker services
start_docker_services() {
    if [ "$SKIP_DOCKER" = true ]; then
        log_info "Skipping Docker services startup (--skip-docker flag)"
        log_warning "Assuming PostgreSQL and MinIO services are already running"
        return 0
    fi
    
    log_info "Starting Docker services..."
    
    if [ ! -f "docker-compose.yml" ] && [ ! -f "docker-compose.yaml" ]; then
        error_exit "docker-compose.yml not found in current directory"
    fi
    
    $COMPOSE_CMD up -d || error_exit "Failed to start Docker services"
    log_success "Docker services started"
}

# Wait for PostgreSQL to be ready
wait_for_postgres() {
    if [ "$SKIP_DOCKER" = true ]; then
        log_info "Skipping PostgreSQL readiness check (--skip-docker flag)"
        log_info "Assuming PostgreSQL is already running and ready"
        return 0
    fi
    
    log_info "Waiting for PostgreSQL to be ready..."
    
    local timeout=$DB_READY_TIMEOUT
    local count=0
    local postgres_container="local-web-api-psql"
    
    # Check if container exists and is running
    if ! docker ps -q -f "name=$postgres_container" | grep -q .; then
        error_exit "PostgreSQL container '$postgres_container' not found or not running"
    fi
    
    # Wait for PostgreSQL to be ready
    while [ $count -lt $timeout ]; do
        if docker exec "$postgres_container" pg_isready -U admin -d database >/dev/null 2>&1; then
            log_success "PostgreSQL is ready"
            return 0
        fi
        
        sleep 1
        count=$((count + 1))
        
        if [ $((count % 10)) -eq 0 ]; then
            log_info "Still waiting for PostgreSQL... (${count}s/${timeout}s)"
        fi
    done
    
    error_exit "PostgreSQL did not become ready within ${timeout} seconds"
}

# Wait for MinIO to be ready
wait_for_minio() {
    if [ "$SKIP_DOCKER" = true ]; then
        log_info "Skipping MinIO readiness check (--skip-docker flag)"
        log_info "Assuming MinIO is already running and ready"
        return 0
    fi
    
    log_info "Waiting for MinIO to be ready..."
    
    local timeout=$MINIO_READY_TIMEOUT
    local count=0
    local minio_container="local-web-api-minio"
    
    # Check if container exists and is running
    if ! docker ps -q -f "name=$minio_container" | grep -q .; then
        error_exit "MinIO container '$minio_container' not found or not running"
    fi
    
    # Wait for MinIO to be ready
    while [ $count -lt $timeout ]; do
        if curl -f "$MINIO_ENDPOINT/minio/health/live" >/dev/null 2>&1; then
            log_success "MinIO is ready"
            return 0
        fi
        
        sleep 1
        count=$((count + 1))
        
        if [ $((count % 10)) -eq 0 ]; then
            log_info "Still waiting for MinIO... (${count}s/${timeout}s)"
        fi
    done
    
    error_exit "MinIO did not become ready within ${timeout} seconds"
}

# Setup MinIO bucket
setup_minio_bucket() {
    log_info "Setting up MinIO bucket: $S3_BUCKET_NAME"
    
    # Determine which mc command to use
    if command_exists mc; then
        MC_CMD="mc"
        log_info "Using system-installed MinIO client"
    elif [ -x "$MC_CACHED" ]; then
        MC_CMD="$MC_CACHED"
        log_info "Using cached MinIO client"
    else
        log_info "Downloading and caching MinIO client..."
        
        # Create cache directory
        mkdir -p "$CACHE_DIR"
        
        # Detect architecture and OS
        local os_type="linux"
        local arch_type="amd64"
        
        if [[ "$OSTYPE" == "darwin"* ]]; then
            os_type="darwin"
        fi
        
        if [[ "$(uname -m)" == "arm64" ]] || [[ "$(uname -m)" == "aarch64" ]]; then
            arch_type="arm64"
        fi
        
        local download_url="https://dl.min.io/client/mc/release/${os_type}-${arch_type}/mc"
        
        if command_exists curl; then
            curl -f -o "$MC_CACHED" "$download_url" || error_exit "Failed to download MinIO client"
        elif command_exists wget; then
            wget -O "$MC_CACHED" "$download_url" || error_exit "Failed to download MinIO client"
        else
            error_exit "curl or wget is required to download MinIO client. Please install one of them."
        fi
        
        chmod +x "$MC_CACHED"
        MC_CMD="$MC_CACHED"
        log_success "MinIO client downloaded and cached at $MC_CACHED"
    fi
    
    # Configure MinIO alias
    log_info "Configuring MinIO client..."
    $MC_CMD alias set local-minio "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 || error_exit "Failed to configure MinIO client"
    
    # Create bucket if it doesn't exist
    if $MC_CMD ls "local-minio/$S3_BUCKET_NAME" >/dev/null 2>&1; then
        log_info "Bucket '$S3_BUCKET_NAME' already exists"
    else
        log_info "Creating bucket '$S3_BUCKET_NAME'..."
        $MC_CMD mb "local-minio/$S3_BUCKET_NAME" || error_exit "Failed to create bucket '$S3_BUCKET_NAME'"
        log_success "Bucket '$S3_BUCKET_NAME' created successfully"
    fi
    
    # Set public read policy for development (optional)
    log_info "Setting bucket policy for development..."
    $MC_CMD anonymous set public "local-minio/$S3_BUCKET_NAME" >/dev/null 2>&1 || log_warning "Could not set public policy on bucket (this is optional)"
}

# Setup API configuration
setup_api_config() {
    log_info "Setting up API configuration..."
    
    if [ ! -d "$API_DIR" ]; then
        error_exit "API directory '$API_DIR' not found"
    fi
    
    cd "$API_DIR"
    
    # Copy environment file if it doesn't exist
    if [ ! -f ".env" ]; then
        if [ -f ".env.dist" ]; then
            cp .env.dist .env || error_exit "Failed to copy .env.dist to .env"
            log_success "Environment file created from .env.dist"
        else
            error_exit ".env.dist file not found in $API_DIR"
        fi
    else
        log_info "Environment file already exists"
    fi
    
    # Update S3 configuration in .env file
    log_info "Updating S3 configuration in .env file..."
    
    # Replace S3_BUCKET_NAME
    if grep -q "S3_BUCKET_NAME=" .env; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|S3_BUCKET_NAME=.*|S3_BUCKET_NAME=$S3_BUCKET_NAME|" .env
        else
            # Linux
            sed -i "s|S3_BUCKET_NAME=.*|S3_BUCKET_NAME=$S3_BUCKET_NAME|" .env
        fi
        log_success "Updated S3_BUCKET_NAME to $S3_BUCKET_NAME"
    else
        echo "S3_BUCKET_NAME=$S3_BUCKET_NAME" >> .env
        log_success "Added S3_BUCKET_NAME=$S3_BUCKET_NAME to .env"
    fi
    
    # Replace MINIO_ENDPOINT
    if grep -q "MINIO_ENDPOINT=" .env; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|MINIO_ENDPOINT=.*|MINIO_ENDPOINT=$MINIO_ENDPOINT|" .env
        else
            # Linux
            sed -i "s|MINIO_ENDPOINT=.*|MINIO_ENDPOINT=$MINIO_ENDPOINT|" .env
        fi
        log_success "Updated MINIO_ENDPOINT to $MINIO_ENDPOINT"
    else
        echo "MINIO_ENDPOINT=$MINIO_ENDPOINT" >> .env
        log_success "Added MINIO_ENDPOINT=$MINIO_ENDPOINT to .env"
    fi
    
    # Add AWS credentials for MinIO if not present
    if ! grep -q "AWS_ACCESS_KEY_ID=" .env; then
        echo "AWS_ACCESS_KEY_ID=$MINIO_ROOT_USER" >> .env
        log_success "Added AWS_ACCESS_KEY_ID for MinIO"
    fi
    
    if ! grep -q "AWS_SECRET_ACCESS_KEY=" .env; then
        echo "AWS_SECRET_ACCESS_KEY=$MINIO_ROOT_PASSWORD" >> .env
        log_success "Added AWS_SECRET_ACCESS_KEY for MinIO"
    fi
    
    if ! grep -q "AWS_REGION=" .env; then
        echo "AWS_REGION=us-east-1" >> .env
        log_success "Added AWS_REGION for MinIO"
    fi
    
    # Verify database configuration for safety
    check_database_config
    
    cd - >/dev/null
}

# Check database configuration to prevent production data loss
check_database_config() {
    log_info "Verifying database configuration for safety..."
    
    if [ ! -f ".env" ]; then
        error_exit ".env file not found"
    fi
    
    # Check for localhost in database URL
    if grep -q "localhost\|127.0.0.1\|::1" .env; then
        log_success "Database configuration appears to be for local development"
    else
        log_error "Database configuration does not appear to be for localhost!"
        log_error "This safety check prevents accidental production database operations."
        log_error "Please ensure your .env file contains localhost database URLs."
        echo
        echo "Current database-related environment variables:"
        grep -i "database\|postgres\|mysql\|db_" .env | sed 's/=.*/=***/' || true
        exit 1
    fi
}

# Check if database needs migration
check_database_status() {
    log_info "Checking database status..."
    
    # Try to check migration status
    if npx prisma migrate status >/dev/null 2>&1; then
        # Check if there are pending migrations
        local status_output
        status_output=$(npx prisma migrate status 2>&1)
        
        if echo "$status_output" | grep -q "Database schema is up to date"; then
            log_success "Database schema is up to date"
            return 0
        elif echo "$status_output" | grep -q "have not yet been applied"; then
            log_info "Database has pending migrations"
            return 1
        else
            log_warning "Could not determine database migration status"
            return 2
        fi
    else
        log_warning "Unable to check database migration status"
        return 2
    fi
}

# Try to migrate database
migrate_database() {
    log_info "Attempting to migrate database..."
    
    if npx prisma migrate deploy >/dev/null 2>&1; then
        log_success "Database migrated successfully"
        return 0
    else
        log_error "Database migration failed"
        return 1
    fi
}

# Ask user for confirmation
ask_user_confirmation() {
    local prompt="$1"
    local response
    
    while true; do
        echo -n "$prompt (y/n): "
        read -r response
        case "$response" in
            [Yy]|[Yy][Ee][Ss])
                return 0
                ;;
            [Nn]|[Nn][Oo])
                return 1
                ;;
            *)
                echo "Please answer yes (y) or no (n)."
                ;;
        esac
    done
}

# Generate local keys and setup database
setup_database() {
    log_info "Setting up database and keys..."
    
    cd "$API_DIR"
    
    # Generate local keys
    log_info "Generating local keys..."
    pnpm run local-keys || error_exit "Failed to generate local keys"
    
    # Generate Prisma client
    log_info "Generating Prisma client..."
    pnpm run prisma-generate || error_exit "Failed to generate Prisma client"
    
    # Handle database setup based on --clear-db flag
    if [ "$CLEAR_DB" = true ]; then
        log_info "Clearing and resetting database (--clear-db flag provided)..."
        pnpm run db-reset || error_exit "Failed to reset database"
    else
        # Check database status first
        local db_status
        check_database_status
        db_status=$?
        
        case $db_status in
            0)
                # Database is up to date, nothing to do
                log_success "Database is already up to date"
                ;;
            1)
                # Has pending migrations, try to migrate
                log_info "Database has pending migrations, attempting to migrate..."
                if migrate_database; then
                    log_success "Database migrated successfully"
                else
                    log_warning "Migration failed. Database may need to be reset."
                    if ask_user_confirmation "Do you want to reset the database? This will delete all data"; then
                        log_info "Resetting database..."
                        pnpm run db-reset || error_exit "Failed to reset database"
                    else
                        log_error "Database setup cancelled by user"
                        exit 1
                    fi
                fi
                ;;
            2)
                # Could not determine status, ask user what to do
                log_warning "Could not determine database status."
                echo "You can either:"
                echo "  1. Try to migrate (safe, preserves data)"
                echo "  2. Reset database (destructive, deletes all data)"
                echo
                if ask_user_confirmation "Do you want to try migrating first"; then
                    if migrate_database; then
                        log_success "Database migrated successfully"
                    else
                        log_warning "Migration failed."
                        if ask_user_confirmation "Do you want to reset the database? This will delete all data"; then
                            log_info "Resetting database..."
                            pnpm run db-reset || error_exit "Failed to reset database"
                        else
                            log_error "Database setup cancelled by user"
                            exit 1
                        fi
                    fi
                else
                    if ask_user_confirmation "Do you want to reset the database? This will delete all data"; then
                        log_info "Resetting database..."
                        pnpm run db-reset || error_exit "Failed to reset database"
                    else
                        log_error "Database setup cancelled by user"
                        exit 1
                    fi
                fi
                ;;
        esac
    fi
    
    cd - >/dev/null
    log_success "Database setup completed"
}

# Start development server
start_dev_server() {
    log_info "Starting development server..."
    
    # Use turbo if available, otherwise use pnpm
    if command_exists turbo; then
        turbo dev --filter=@reefguide/web-api --filter=@reefguide/app
    elif npx turbo --version >/dev/null 2>&1; then
        npx turbo dev --filter=@reefguide/web-api
    else
        log_warning "Turbo not found, falling back to pnpm"
        cd "$API_DIR"
        pnpm run dev
    fi
}

# Cleanup function for graceful shutdown
cleanup() {
    if [ "$CLEANUP_ON_EXIT" = true ]; then
        log_info "Cleaning up Docker services..."
        if [ -n "$COMPOSE_CMD" ]; then
            $COMPOSE_CMD down >/dev/null 2>&1 || true
        fi
    else
        log_info "Leaving Docker services running (use --cleanup to stop on exit)"
    fi
}

# Main execution
main() {
    echo "============================================"
    echo "ReefGuide Development Environment Setup"
    echo "============================================"
    echo
    
    # Set up cleanup trap
    trap cleanup EXIT INT TERM
    
    # Verify we're in the right directory
    if [ ! -f "package.json" ]; then
        error_exit "No package.json found. Please run this script from the project root directory."
    fi
    
    # Execute setup steps
    setup_node_manager
    check_docker
    install_global_deps
    install_project_deps
    start_docker_services
    wait_for_postgres
    wait_for_minio
    setup_minio_bucket
    setup_api_config
    setup_database
    
    echo
    log_success "Setup completed successfully!"
    echo
    log_info "Services are ready:"
    log_info "  - PostgreSQL: localhost:5432"
    log_info "  - MinIO API: $MINIO_ENDPOINT"
    log_info "  - MinIO Console: http://localhost:9001"
    log_info "  - S3 Bucket: $S3_BUCKET_NAME"
    echo
    log_info "MinIO client cached at: $MC_CACHED"
    echo
    log_info "Node.js version manager: $NODE_MANAGER"
    echo
    log_info "Starting development server..."
    start_dev_server
}

# Script usage information
usage() {
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -h, --help      Show this help message"
    echo "  --clear-db      Force database reset (destructive, deletes all data)"
    echo "  --cleanup       Enable Docker cleanup on script exit (default: disabled)"
    echo "  --skip-docker   Skip Docker setup and checks (assumes services are running)"
    echo "  --skip-deps     Skip global and project dependency installation"
    echo
    echo "Database Management:"
    echo "  By default, the script will:"
    echo "    1. Check if database schema is up to date"
    echo "    2. If not, attempt to migrate safely"
    echo "    3. If migration fails, ask user whether to reset"
    echo
    echo "  With --clear-db flag:"
    echo "    - Always resets the database (destructive operation)"
    echo "    - Use this for a clean development environment"
    echo
    echo "Docker Cleanup:"
    echo "  By default, Docker services are left running when script exits"
    echo "  Use --cleanup to stop services on exit"
    echo "  This allows you to keep services running between script runs"
    echo
    echo "This script sets up the complete ReefGuide development environment."
    echo "It will:"
    echo "  1. Detect and use fnm or nvm for Node.js $NODE_VERSION management"
    echo "  2. Install and configure Node.js $NODE_VERSION"
    echo "  3. Install global dependencies (pnpm)"
    echo "  4. Install project dependencies"
    echo "  5. Start Docker services (PostgreSQL + MinIO)"
    echo "  6. Wait for PostgreSQL to be ready"
    echo "  7. Wait for MinIO to be ready"
    echo "  8. Create S3 bucket: $S3_BUCKET_NAME"
    echo "  9. Setup API configuration with S3 settings"
    echo "  10. Generate keys and setup database (migrate or reset)"
    echo "  11. Start the development server"
    echo
    echo "Node.js Version Managers (in order of preference):"
    echo "  - fnm (Fast Node Manager) - recommended"
    echo "  - nvm (Node Version Manager)"
    echo
    echo "MinIO Configuration:"
    echo "  - API Endpoint: $MINIO_ENDPOINT"
    echo "  - Console: http://localhost:9001"
    echo "  - Bucket: $S3_BUCKET_NAME"
    echo "  - Credentials: $MINIO_ROOT_USER / $MINIO_ROOT_PASSWORD"
    echo "  - Client Cache: $CACHE_DIR/mc"
    echo
    echo "Skip Options:"
    echo "  --skip-docker: Skips all Docker-related operations"
    echo "    - Docker installation/version checks"
    echo "    - Starting Docker Compose services"
    echo "    - Waiting for PostgreSQL/MinIO readiness"
    echo "    - Assumes services are already running externally"
    echo
    echo "  --skip-deps: Skips all dependency installation"
    echo "    - Global dependencies (pnpm installation)"
    echo "    - Project dependencies (pnpm install)"
    echo "    - Useful when dependencies are already installed"
    echo
}

# Handle command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        --clear-db)
            CLEAR_DB=true
            shift
            ;;
        --cleanup)
            CLEANUP_ON_EXIT=true
            shift
            ;;
        --skip-docker)
            SKIP_DOCKER=true
            shift
            ;;
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

main
